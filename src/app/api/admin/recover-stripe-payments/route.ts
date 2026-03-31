import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import Stripe from "stripe";

/**
 * POST /api/admin/recover-stripe-payments
 *
 * RECOVER ALL STRIPE PAYMENTS AND CREDIT USER BALANCES
 *
 * 1. Uses Stripe secret key
 * 2. Fetches all checkout sessions where payment_status = paid
 * 3. For each: customer_email, amount_total
 * 4. Find matching user in Supabase by email
 * 5. Add amount to users.balance and users.total_deposits
 * 6. Save in transactions (type=deposit, source=stripe_recovery)
 * 7. Prevent duplicates: check stripe_session_id / reference_id before inserting
 * 8. Return: recovered count, total amount
 * Admin only.
 */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const secret = process.env.STRIPE_SECRET_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!secret?.startsWith("sk_")) {
    return NextResponse.json({ success: false, message: "Stripe not configured" }, { status: 503 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Supabase not configured" }, { status: 503 });
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-01-28.clover" });
  const sessions: Stripe.Checkout.Session[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  try {
    while (hasMore) {
      const list = await stripe.checkout.sessions.list({
        limit: 100,
        ...(startingAfter && { starting_after: startingAfter }),
        expand: ["data.customer", "data.payment_intent"],
      });
      sessions.push(...list.data);
      hasMore = list.has_more;
      if (list.data.length > 0) {
        startingAfter = list.data[list.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stripe list sessions failed";
    console.error("[recover-stripe-payments] Stripe error:", msg);
    return NextResponse.json({ success: false, message: "Stripe error", error: msg }, { status: 502 });
  }

  const paid = sessions.filter((s) => s.payment_status === "paid");
  let recovered = 0;
  let totalAmountCents = 0;

  for (const session of paid) {
    const sessionId = session.id;
    const amountTotal = session.amount_total ?? 0;
    if (amountTotal <= 0) continue;

    // 7) Prevent duplicates: check by stripe_session_id (stripe_payments or transactions)
    const { data: existingByRef } = await supabase
      .from("transactions")
      .select("id")
      .eq("reference_id", sessionId)
      .eq("type", "deposit")
      .maybeSingle();
    if (existingByRef) continue;

    const { data: existingPayment } = await supabase
      .from("stripe_payments")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (existingPayment) continue;

    const customerEmail =
      (session.customer_email as string) ??
      (session.metadata?.email as string) ??
      "";
    const stripeCustomerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer as Stripe.Customer)?.id ?? null;

    // 4) Find matching user by email (or metadata/client_reference_id)
    let userId: string | null =
      (session.metadata?.user_id ?? session.metadata?.userId ?? session.client_reference_id) as string | null;

    if (!userId && customerEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", customerEmail)
        .maybeSingle();
      if (profile && typeof (profile as { id?: string }).id === "string") {
        userId = (profile as { id: string }).id;
      }
      if (!userId) {
        const { data: user } = await supabase
          .from("users")
          .select("id")
          .eq("email", customerEmail)
          .maybeSingle();
        if (user && typeof (user as { id?: string }).id === "string") {
          userId = (user as { id: string }).id;
        }
      }
    }

    if (!userId) continue;

    const ledgerRef = `stripe_session_${sessionId}`;
    const ledger = await walletLedgerEntry(userId, "deposit", amountTotal, ledgerRef);
    if (!ledger.success) {
      if (ledger.message === "Duplicate transaction") {
        continue;
      }
      console.error("[recover-stripe-payments] walletLedgerEntry:", ledger.message);
      continue;
    }

    const amountDollars = amountTotal / 100;
    const currency = (session.currency ?? "usd").toLowerCase();
    const metadata = {
      user_id: userId,
      email: customerEmail || undefined,
      stripe_customer_id: stripeCustomerId || undefined,
    };

    // stripe_payments
    const stripePaymentRow = {
      stripe_session_id: sessionId,
      user_id: userId,
      email: customerEmail || "unknown",
      amount: amountDollars,
      currency,
      status: "completed",
      metadata,
      created_at: new Date().toISOString(),
    };
    const { error: spErr } = await supabase.from("stripe_payments").insert(stripePaymentRow);
    if (spErr) {
      const code = (spErr as { code?: string }).code;
      if (code === "42703") {
        await supabase.from("stripe_payments").insert({
          stripe_session_id: sessionId,
          user_id: userId,
          email: customerEmail || "unknown",
          amount: amountDollars,
          currency,
          status: "completed",
          created_at: new Date().toISOString(),
        }).then(({ error: e }) => {
          if (e && (e as { code?: string }).code !== "23505") console.error("[recover-stripe-payments] stripe_payments:", e.message);
        });
      } else if (code !== "23505") {
        console.error("[recover-stripe-payments] stripe_payments insert error:", spErr);
        continue;
      }
    }

    // 6) transactions: type=deposit, source=stripe_recovery
    const txRow: Record<string, unknown> = {
      user_id: userId,
      type: "deposit",
      amount: amountTotal,
      status: "completed",
      description: `Stripe recovery ${sessionId}`,
      reference_id: sessionId,
      source: "stripe_recovery",
    };
    const { error: txErr } = await supabase.from("transactions").insert(txRow);
    if (txErr) {
      const code = (txErr as { code?: string }).code;
      if (code === "42703") {
        const { error: txErr2 } = await supabase.from("transactions").insert({
          user_id: userId,
          type: "deposit",
          amount: amountTotal,
          status: "completed",
          description: `Stripe recovery ${sessionId}`,
          reference_id: sessionId,
        });
        if (txErr2 && (txErr2 as { code?: string }).code !== "23505") {
          console.error("[recover-stripe-payments] transactions insert error:", txErr2);
          continue;
        }
      } else if (code !== "23505") {
        console.error("[recover-stripe-payments] transactions insert error:", txErr);
        continue;
      }
    }

    // deposits
    const { data: existingDep } = await supabase
      .from("deposits")
      .select("id")
      .or(`stripe_session.eq.${sessionId},stripe_session_id.eq.${sessionId}`)
      .maybeSingle();
    if (!existingDep) {
      await supabase.from("deposits").insert({
        user_id: userId,
        amount: amountDollars,
        stripe_session: sessionId,
        stripe_session_id: sessionId,
        status: "completed",
      }).then(({ error: e }) => {
        if (e) console.error("[recover-stripe-payments] deposits insert:", e.message);
      });
    }

    const { data: u } = await supabase.from("users").select("total_deposits").eq("id", userId).maybeSingle();
    const prevDep = Number((u as { total_deposits?: number } | null)?.total_deposits ?? 0);
    await supabase
      .from("users")
      .update({
        total_deposits: prevDep + amountTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    recovered += 1;
    totalAmountCents += amountTotal;
  }

  return NextResponse.json({
    success: true,
    recovered,
    totalAmountCents,
    totalAmountDollars: totalAmountCents / 100,
  });
}
