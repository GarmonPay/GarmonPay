import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import Stripe from "stripe";

/** Stripe webhook endpoint: /api/stripe/webhook */
export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim().replace(/^["']|["']$/g, "") ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

function createServiceRoleClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "/api/stripe/webhook" });
}

export async function POST(req: Request) {
  console.log("[Stripe webhook] Incoming request at /api/stripe/webhook");

  if (!WEBHOOK_SECRET) {
    console.error("[Stripe webhook] STRIPE_WEBHOOK_SECRET is not configured");
    return new Response("Webhook secret missing", { status: 500 });
  }
  if (!isStripeConfigured()) {
    console.error("[Stripe webhook] STRIPE_SECRET_KEY is not configured");
    return new Response("Stripe secret key missing", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("[Stripe webhook] Missing stripe-signature header");
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  // IMPORTANT: read raw body for signature verification (do not JSON.parse first).
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown signature verification error";
    console.error("[Stripe webhook] Signature verification failed:", message);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    console.log(`[Stripe webhook] Ignored event type: ${event.type}`);
    return new Response("OK", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const sessionId = session.id;
  const userId = session.metadata?.user_id;
  const amountCents = session.amount_total ?? 0;

  if (!sessionId) {
    console.error("[Stripe webhook] Missing checkout session id");
    return new Response("Invalid session payload", { status: 400 });
  }
  if (!userId) {
    console.error("[Stripe webhook] Missing metadata.user_id for session:", sessionId);
    return new Response("Missing metadata.user_id", { status: 400 });
  }
  if (session.payment_status !== "paid") {
    console.log("[Stripe webhook] Session is not paid yet, session:", sessionId, "status:", session.payment_status);
    return new Response("OK", { status: 200 });
  }
  if (amountCents <= 0) {
    console.error("[Stripe webhook] Invalid amount_total for session:", sessionId, "amount:", amountCents);
    return new Response("Invalid payment amount", { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    console.error("[Stripe webhook] Supabase service role client is not configured");
    return new Response("Supabase service role not configured", { status: 500 });
  }

  const { data: existingTx, error: existingTxError } = await supabase
    .from("transactions")
    .select("id")
    .eq("type", "deposit")
    .eq("stripe_session", sessionId)
    .maybeSingle();

  if (existingTxError) {
    console.error("[Stripe webhook] Failed checking existing transaction:", existingTxError);
    return new Response("Failed to check existing transaction", { status: 500 });
  }

  if (existingTx) {
    console.log("[Stripe webhook] Duplicate webhook ignored for session:", sessionId);
    return new Response("OK", { status: 200 });
  }

  const { data: insertedTx, error: txInsertError } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      amount: amountCents,
      type: "deposit",
      stripe_session: sessionId,
    })
    .select("id")
    .single();

  if (txInsertError) {
    console.error("[Stripe webhook] Failed to insert transaction:", txInsertError);
    return new Response("Failed to insert transaction", { status: 500 });
  }

  const { error: balanceError } = await supabase.rpc("increment_user_balance", {
    p_user_id: userId,
    p_amount_cents: amountCents,
  });

  if (balanceError) {
    console.error("[Stripe webhook] Failed to increment user balance:", balanceError);
    if (insertedTx?.id) {
      const { error: rollbackError } = await supabase.from("transactions").delete().eq("id", insertedTx.id);
      if (rollbackError) {
        console.error("[Stripe webhook] Failed to rollback inserted transaction:", rollbackError);
      }
    }
    return new Response("Failed to increment user balance", { status: 500 });
  }

  console.log(
    "[Stripe webhook] Payment processed successfully",
    JSON.stringify({
      eventId: event.id,
      sessionId,
      userId,
      amountCents,
    }),
  );

  return new Response("OK", { status: 200 });
}
