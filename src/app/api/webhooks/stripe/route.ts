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
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // 5. Extract customer_email and amount_total
  const customer_email =
    session.customer_details?.email ?? session.customer_email ?? null;
  const amount_total = session.amount_total ?? 0;
  const mode = session.mode ?? "payment";

  if (mode !== "payment" || amount_total <= 0) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const amountCents = Math.round(amount_total);
  const amountDollars = amount_total / 100;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  // 6. Find user: prefer metadata.user_id, else by email
  let userId: string | null = (session.metadata as { user_id?: string } | null)?.user_id ?? null;
  if (!userId && customer_email) {
    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .eq("email", customer_email)
      .maybeSingle();
    userId = (userRow as { id?: string } | null)?.id ?? null;
  }

  if (!userId) {
    console.error("Stripe webhook: no user found for session", session.id, "email:", customer_email);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    // 7. Add amount to user's balance
    const { data: userRow } = await supabase
      .from("users")
      .select("balance")
      .eq("id", userId)
      .single();
    const currentBalance = Number(userRow?.balance ?? 0);
    await supabase
      .from("users")
      .update({ balance: currentBalance + amountCents })
      .eq("id", userId);

    // 8. Save transaction record (and deposit)
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: amountCents,
      status: "completed",
      description: "Stripe payment",
    });
    await supabase.from("deposits").insert({
      user_id: userId,
      amount: amountDollars,
      stripe_session: session.id ?? null,
    });
  } catch (err) {
    console.error("Stripe webhook processing error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  // 9. Return 200 to Stripe
  return NextResponse.json({ received: true }, { status: 200 });
}
