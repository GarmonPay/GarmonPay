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

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !secret) {
    return NextResponse.json({ error: "Missing webhook signature or secret" }, { status: 400 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
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
    const amountTotal = session.amount_total ?? 0;
    if (amountTotal <= 0) {
      return NextResponse.json({ received: true });
    }

    const amountCents = Math.round(amountTotal);
    const amount = amountTotal / 100;
    const metadata = (session.metadata ?? {}) as Record<string, string>;
    const userId = metadata.user_id ?? metadata.userId ?? null;
    const email = session.customer_details?.email ?? session.customer_email ?? null;

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    if (userId) {
      const { error } = await supabase.rpc("increment_user_balance", {
        p_user_id: userId,
        p_amount_cents: amountCents,
      });
      if (error) {
        console.error("Stripe webhook increment_user_balance error:", error);
      }
    }

    if (email && !userId) {
      await supabase.rpc("add_funds", {
        user_email: email,
        amount,
      });
    }

    const { error: depositError } = await supabase.from("deposits").insert({
      user_id: userId,
      amount,
      status: "completed",
    });
    if (depositError) {
      console.error("Stripe webhook deposits insert error:", depositError);
    }

    await supabase.from("revenue_transactions").insert({
      email: email ?? "",
      amount,
      type: session.mode ?? "payment",
    });
  }

  return NextResponse.json({ received: true });
}
