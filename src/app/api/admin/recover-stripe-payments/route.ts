import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";
import Stripe from "stripe";

/**
 * POST /api/admin/recover-stripe-payments
 *
 * FULL PAYMENT RECOVERY: Fetches ALL paid Stripe checkout sessions (paginated),
 * inserts into stripe_payments (with metadata), transactions, updates user balance.
 * Uses ON CONFLICT (stripe_session_id) DO NOTHING to prevent duplicates.
 * Admin only. Production safe.
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

  for (const session of paid) {
    const sessionId = session.id;
    const amountTotal = session.amount_total ?? 0;
    if (amountTotal <= 0) continue;

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

    const amountDollars = amountTotal / 100;
    const currency = (session.currency ?? "usd").toLowerCase();
    const metadata = {
      user_id: userId,
      email: customerEmail || undefined,
      stripe_customer_id: stripeCustomerId || undefined,
    };

    // 1) stripe_payments — insert (duplicate check already done above)
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
        const { error: spErr2 } = await supabase.from("stripe_payments").insert({
          stripe_session_id: sessionId,
          user_id: userId,
          email: customerEmail || "unknown",
          amount: amountDollars,
          currency,
          status: "completed",
          created_at: new Date().toISOString(),
        });
        if (spErr2 && (spErr2 as { code?: string }).code !== "23505") {
          console.error("[recover-stripe-payments] stripe_payments insert fallback error:", spErr2);
          continue;
        }
      } else if (code !== "23505") {
        console.error("[recover-stripe-payments] stripe_payments insert error:", spErr);
        continue;
      }
    }

    // 2) transactions — insert if not exists
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("type", "deposit")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();
    if (!existingTx) {
      const { error: txErr } = await supabase.from("transactions").insert({
        user_id: userId,
        type: "deposit",
        amount: amountDollars,
        stripe_session_id: sessionId,
        created_at: new Date().toISOString(),
        status: "completed",
        description: `Stripe recovery ${sessionId}`,
        reference_id: sessionId,
      });
      if (txErr && (txErr as { code?: string }).code !== "23505") {
        console.error("[recover-stripe-payments] transactions insert error:", txErr);
      }
    }

    // 3) deposits — insert if not exists
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
      });
    }

    // 4) Increase user balance
    const { error: rpcErr } = await supabase.rpc("increment_user_balance", {
      p_user_id: userId,
      p_amount_cents: amountTotal,
    });
    if (rpcErr) {
      const { data: u } = await supabase.from("users").select("balance, total_deposits").eq("id", userId).maybeSingle();
      const cur = (u as { balance?: number; total_deposits?: number }) ?? {};
      await supabase
        .from("users")
        .update({
          balance: Number(cur.balance ?? 0) + amountTotal,
          total_deposits: Number(cur.total_deposits ?? 0) + amountTotal,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    } else {
      const { data: u } = await supabase.from("users").select("total_deposits").eq("id", userId).maybeSingle();
      const prev = Number((u as { total_deposits?: number })?.total_deposits ?? 0);
      await supabase
        .from("users")
        .update({ total_deposits: prev + amountTotal, updated_at: new Date().toISOString() })
        .eq("id", userId);
    }

    recovered += 1;
  }

  return NextResponse.json({ success: true, recovered });
}
