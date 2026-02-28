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

/** GET /api/webhooks/stripe — health check for Stripe webhook endpoint. */
export async function GET() {
  return NextResponse.json({ status: "live" });
}

/**
 * POST /api/webhooks/stripe — production Stripe webhook handler.
 * 1. Accept POST from Stripe
 * 2. Read raw body
 * 3. Verify signature with STRIPE_WEBHOOK_SECRET
 * 4. Handle checkout.session.completed
 * 5. Extract customer_email, amount_total → find user by email (or metadata.user_id), add to balance, save transaction
 * 6. Return 200 to Stripe
 */
export async function POST(req: Request) {
  // 1. Read raw body (required for signature verification)
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  // 2. Get signature and secret
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) {
    return NextResponse.json({ error: "Missing webhook signature or secret" }, { status: 400 });
  }

  // 3. Verify Stripe signature
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

  // 4. Handle checkout.session.completed
  if (event.type === "checkout.session.completed") {

    const session = event.data.object as Stripe.Checkout.Session;

    const email = session.customer_email;

    const amount = (session.amount_total ?? 0) / 100;

    const supabase = getSupabase();
    if (!supabase) {
      console.error("Supabase not initialized");
      return new Response("Supabase error", { status: 500 });
    }

    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single();

    if (!user) {
      console.error("User not found:", email);
      return new Response("User not found");
    }

    const newBalance = (user.balance || 0) + amount;

    await supabase
      .from("users")
      .update({
        balance: newBalance,
        total_deposits: (user.total_deposits || 0) + amount,
      })
      .eq("id", user.id);

  }

  return NextResponse.json({ received: true }, { status: 200 });
}
