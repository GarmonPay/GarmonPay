import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_")) return null;
  return new Stripe(key, { apiVersion: "2026-01-28.clover" });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET() {
  return NextResponse.json({ status: "live" });
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Missing webhook signature or secret" }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    const amountTotal = session.amount_total ?? 0;
    const amount = amountTotal / 100;
    const mode = session.mode ?? "payment";

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const sessionId = session.id;
    let depositUserId = (session.metadata as { user_id?: string } | null)?.user_id ?? null;
    if (!depositUserId && email) {
      const { data: matchedUser, error: matchedUserError } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (matchedUserError) {
        console.error(matchedUserError);
      }
      depositUserId = (matchedUser as { id?: string } | null)?.id ?? null;
    }

    if (depositUserId && amountTotal > 0 && mode === "payment") {
      const { error: depositError } = await supabase.from("deposits").insert({
        user_id: depositUserId,
        amount: amountTotal / 100,
        stripe_session: sessionId,
        status: "completed",
      });
      if (depositError) {
        console.error("Stripe webhook insert deposits error:", depositError);
      }
    }

    if (mode === "payment" && amountTotal > 0) {
      const amountCents = Math.round(amountTotal);
      const amountDollars = amountTotal / 100;
      const userId = (session.metadata as { user_id?: string } | null)?.user_id;

      if (email) {
        const { error: addFundsError } = await supabase.rpc("add_funds", {
          user_email: email,
          amount: amountDollars,
        });
        if (addFundsError) {
          console.error("Stripe webhook add_funds error:", addFundsError);
        }
      }

      if (userId) {
        const { error: incrementError } = await supabase.rpc("increment_user_balance", {
          p_user_id: userId,
          p_amount_cents: amountCents,
        });
        if (incrementError) {
          console.error("Stripe webhook increment_user_balance error:", incrementError);
        }
      }
    }

    if (mode === "subscription" && email) {
      const { error: membershipError } = await supabase
        .from("users")
        .update({ membership: "active", updated_at: new Date().toISOString() })
        .eq("email", email);
      if (membershipError) {
        console.error("Stripe webhook subscription membership update error:", membershipError);
      }
    }

    if (email) {
      const { error: revenueError } = await supabase.from("revenue_transactions").insert({
        email: email ?? "",
        amount,
        type: mode,
      });
      if (revenueError) {
        console.error("Stripe webhook revenue_transactions insert error:", revenueError);
      }
    }
  }

  return NextResponse.json({ received: true });
}
