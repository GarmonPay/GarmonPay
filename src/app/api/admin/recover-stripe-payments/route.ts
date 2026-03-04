import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseErrorLike = { code?: string; message?: string };
type BalanceRow = { balance?: number | string | null };
type UserBalanceRow = { balance?: number | string | null; total_deposits?: number | string | null };
type SimpleUserRow = { id?: string | null };

function normalizeStripeSecret(raw: string | undefined): string | null {
  const secret = raw?.trim().replace(/^["']|["']$/g, "") ?? "";
  return secret.startsWith("sk_") ? secret : null;
}

function isMissingRelation(error: SupabaseErrorLike | null | undefined): boolean {
  return error?.code === "42P01";
}

function isMissingColumn(error: SupabaseErrorLike | null | undefined): boolean {
  return error?.code === "42703";
}

function isMissingFunction(error: SupabaseErrorLike | null | undefined): boolean {
  return error?.code === "42883";
}

function getStripeCustomerId(session: Stripe.Checkout.Session): string {
  if (typeof session.customer === "string") {
    return session.customer;
  }
  if (session.customer && typeof session.customer !== "string" && "id" in session.customer) {
    return session.customer.id;
  }
  return "";
}

function getSessionEmail(session: Stripe.Checkout.Session): string {
  if (session.customer_email) return session.customer_email;
  if (session.metadata?.email) return session.metadata.email;
  if (session.customer && typeof session.customer !== "string" && "email" in session.customer) {
    return session.customer.email ?? "";
  }
  return "";
}

function getSessionUserIdHint(session: Stripe.Checkout.Session): string | null {
  const metadata = session.metadata;
  const candidate = metadata?.user_id ?? metadata?.userId ?? session.client_reference_id;
  return typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim() : null;
}

async function findUserIdByEmail(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data: usersRow } = await supabase
    .from("users")
    .select("id")
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();
  const usersId = (usersRow as SimpleUserRow | null)?.id;
  if (typeof usersId === "string" && usersId) return usersId;

  const { data: profilesRow } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", normalized)
    .limit(1)
    .maybeSingle();
  const profilesId = (profilesRow as SimpleUserRow | null)?.id;
  if (typeof profilesId === "string" && profilesId) return profilesId;

  return null;
}

async function incrementBalance(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  amountCents: number,
): Promise<void> {
  const now = new Date().toISOString();

  const { data: existingBalance, error: balanceQueryError } = await supabase
    .from("balances")
    .select("balance")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!balanceQueryError) {
    const current = Number((existingBalance as BalanceRow | null)?.balance ?? 0);
    if (existingBalance) {
      const { error: updateBalanceError } = await supabase
        .from("balances")
        .update({ balance: current + amountCents })
        .eq("user_id", userId);
      if (updateBalanceError) throw updateBalanceError;
      return;
    }

    const { error: insertBalanceError } = await supabase.from("balances").insert({
      user_id: userId,
      balance: amountCents,
    });
    if (insertBalanceError) throw insertBalanceError;
    return;
  }

  // Compatibility fallback for deployments where "balances" table is not present.
  if (
    !isMissingRelation(balanceQueryError as SupabaseErrorLike)
    && !isMissingColumn(balanceQueryError as SupabaseErrorLike)
  ) {
    throw balanceQueryError;
  }

  const { error: rpcError } = await supabase.rpc("increment_user_balance", {
    p_user_id: userId,
    p_amount_cents: amountCents,
  });
  if (!rpcError) return;

  if (!isMissingFunction(rpcError as SupabaseErrorLike)) {
    throw rpcError;
  }

  const { data: userRow, error: userReadError } = await supabase
    .from("users")
    .select("balance, total_deposits")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();
  if (userReadError) throw userReadError;

  const currentBalance = Number((userRow as UserBalanceRow | null)?.balance ?? 0);
  const currentTotalDeposits = Number((userRow as UserBalanceRow | null)?.total_deposits ?? 0);
  const { error: userUpdateError } = await supabase
    .from("users")
    .update({
      balance: currentBalance + amountCents,
      total_deposits: currentTotalDeposits + amountCents,
      updated_at: now,
    })
    .eq("id", userId);
  if (userUpdateError) throw userUpdateError;
}

/**
 * POST /api/admin/recover-stripe-payments
 *
 * Fetches all paid Stripe checkout sessions and recovers missing payment rows.
 * - stripe_payments insert is deduplicated via ON CONFLICT (stripe_session_id) DO NOTHING.
 * - creates missing deposit transaction rows.
 * - increments balance once for newly inserted deposit transactions.
 */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const stripeSecret = normalizeStripeSecret(process.env.STRIPE_SECRET_KEY);
  if (!stripeSecret) {
    return NextResponse.json({ success: false, message: "Stripe not configured" }, { status: 503 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return NextResponse.json({ success: false, message: "Supabase service role is not configured" }, { status: 503 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ success: false, message: "Supabase not configured" }, { status: 503 });
  }

  const stripe = new Stripe(stripeSecret, { apiVersion: "2026-01-28.clover" });
  let recovered = 0;
  let startingAfter: string | undefined;

  try {
    while (true) {
      const page = await stripe.checkout.sessions.list({
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
        expand: ["data.customer", "data.payment_intent"],
      });

      if (page.data.length === 0) break;

      for (const session of page.data) {
        if (session.payment_status !== "paid") continue;
        const amountTotal = session.amount_total ?? 0;
        if (amountTotal <= 0) continue;

        const sessionId = session.id;
        const email = getSessionEmail(session).trim().toLowerCase();
        const stripeCustomerId = getStripeCustomerId(session);
        const userIdFromSession = getSessionUserIdHint(session);
        const userId = userIdFromSession ?? (email ? await findUserIdByEmail(supabase, email) : null);

        if (!userId) {
          console.warn("[recover-stripe-payments] Skipping session without resolvable user_id:", sessionId);
          continue;
        }

        const metadata = {
          user_id: userId,
          email,
          stripe_customer_id: stripeCustomerId,
        };

        const createdAtIso = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
        const amount = amountTotal / 100;
        const currency = (session.currency ?? "usd").toLowerCase();

        const { data: insertedStripePayment, error: stripePaymentError } = await supabase
          .from("stripe_payments")
          .upsert(
            {
              stripe_session_id: sessionId,
              user_id: userId,
              email: email || "unknown",
              amount,
              currency,
              status: "completed",
              metadata,
              created_at: createdAtIso,
            },
            {
              onConflict: "stripe_session_id",
              ignoreDuplicates: true,
            },
          )
          .select("stripe_session_id");

        if (stripePaymentError) {
          console.error("[recover-stripe-payments] stripe_payments upsert failed:", stripePaymentError);
          continue;
        }

        const wasStripePaymentInserted = Array.isArray(insertedStripePayment) && insertedStripePayment.length > 0;
        if (!wasStripePaymentInserted) {
          const { error: metadataRepairError } = await supabase
            .from("stripe_payments")
            .update({
              user_id: userId,
              email: email || "unknown",
              amount,
              currency,
              status: "completed",
              metadata,
            })
            .eq("stripe_session_id", sessionId);
          if (metadataRepairError) {
            console.error(
              "[recover-stripe-payments] stripe_payments metadata repair failed:",
              metadataRepairError,
            );
          }
        }

        let shouldIncrementBalance = false;
        const { data: existingTx, error: existingTxError } = await supabase
          .from("transactions")
          .select("id")
          .eq("reference_id", sessionId)
          .eq("type", "deposit")
          .limit(1)
          .maybeSingle();

        if (existingTxError) {
          console.error("[recover-stripe-payments] transactions lookup failed:", existingTxError);
          continue;
        }

        if (!existingTx) {
          const { error: txInsertError } = await supabase.from("transactions").insert({
            user_id: userId,
            type: "deposit",
            amount: amountTotal,
            status: "completed",
            description: `Stripe recovery ${sessionId}`,
            reference_id: sessionId,
          });

          if (txInsertError) {
            console.error("[recover-stripe-payments] transactions insert failed:", txInsertError);
            continue;
          }

          shouldIncrementBalance = true;
        }

        if (shouldIncrementBalance) {
          try {
            await incrementBalance(supabase, userId, amountTotal);
          } catch (balanceError) {
            console.error("[recover-stripe-payments] balance increment failed:", balanceError);
            continue;
          }
        }

        if (wasStripePaymentInserted || shouldIncrementBalance) {
          recovered += 1;
        }
      }

      if (!page.has_more) break;

      const last = page.data[page.data.length - 1];
      if (!last?.id) break;
      startingAfter = last.id;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to recover Stripe sessions";
    console.error("[recover-stripe-payments] fatal error:", message);
    return NextResponse.json({ success: false, message: "Recovery failed", error: message }, { status: 500 });
  }

  return NextResponse.json({ success: true, recovered });
}
