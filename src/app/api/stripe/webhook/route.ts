import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import Stripe from "stripe";

/** Canonical Stripe webhook: https://garmonpay.com/api/stripe/webhook */
export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/** GET — health check. */
export async function GET() {
  return NextResponse.json({ status: "live" });
}

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    console.error("[Stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret missing", { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    console.error("[Stripe webhook] Missing stripe-signature header");
    return new Response("Missing stripe-signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    if (!isStripeConfigured()) {
      console.error("[Stripe webhook] STRIPE_SECRET_KEY is not set");
      return new Response("Stripe not configured", { status: 503 });
    }
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[Stripe webhook] Signature verification error:", message);
    return new Response(message, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("OK", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const amount_total = session.amount_total ?? 0;

  if (session.payment_status !== "paid" || amount_total <= 0) {
    return new Response("OK", { status: 200 });
  }

  let user_id: string | null =
    (session.metadata?.user_id ?? session.metadata?.userId ?? session.client_reference_id) as string | null;

  const supabase = createAdminClient();
  if (!supabase) {
    console.error("[Stripe webhook] Supabase admin client unavailable");
    return new Response("Database unavailable", { status: 500 });
  }

  if (!user_id) {
    const customer_email =
      (session.customer_email as string) ??
      (session.metadata?.email as string) ??
      "";
    if (customer_email) {
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("email", customer_email)
        .maybeSingle();
      if (userRow && typeof (userRow as { id?: string }).id === "string") {
        user_id = (userRow as { id: string }).id;
      }
    }
    if (!user_id) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", customer_email)
        .maybeSingle();
      if (profileRow && typeof (profileRow as { id?: string }).id === "string") {
        user_id = (profileRow as { id: string }).id;
      }
    }
  }

  if (!user_id) {
    console.error("[Stripe webhook] No user_id for session:", session.id);
    return new Response("OK", { status: 200 });
  }

  const session_id = session.id;
  const amount_dollars = amount_total / 100;

  const { data: userRow } = await supabase
    .from("users")
    .select("balance, total_deposits")
    .eq("id", user_id)
    .maybeSingle();

  const currentBalance = Number((userRow as { balance?: number } | null)?.balance ?? 0);
  const currentTotalDeposits = Number((userRow as { total_deposits?: number } | null)?.total_deposits ?? 0);
  const newBalance = currentBalance + amount_total;
  const newTotalDeposits = currentTotalDeposits + amount_total;

  const { error: balanceErr } = await supabase
    .from("users")
    .update({
      balance: newBalance,
      total_deposits: newTotalDeposits,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user_id);

  if (balanceErr) {
    console.error("[Stripe webhook] users.balance update failed:", balanceErr);
    return new Response("Balance update failed", { status: 500 });
  }
  console.log("[Stripe webhook] Balance credited — user_id:", user_id, "amount_cents:", amount_total);

  await supabase.from("transactions").insert({
    user_id,
    type: "deposit",
    amount: amount_total,
    status: "completed",
    description: `Stripe checkout ${session_id}`,
    reference_id: session_id,
  }).then(({ error }) => {
    if (error) console.error("[Stripe webhook] transactions insert:", error.message);
  });

  const { data: existingDeposit } = await supabase
    .from("deposits")
    .select("id")
    .or(`stripe_session.eq.${session_id},stripe_session_id.eq.${session_id}`)
    .maybeSingle();

  if (!existingDeposit) {
    await supabase.from("deposits").insert({
      user_id,
      amount: amount_dollars,
      stripe_session: session_id,
      stripe_session_id: session_id,
      status: "completed",
    }).then(({ error }) => {
      if (error) console.error("[Stripe webhook] deposits insert:", error.message);
    });
  }

  const payment_intent_id =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;
  const customer_email =
    (session.customer_email as string) ?? (session.metadata?.email as string) ?? "";

  await supabase.from("stripe_payments").insert({
    user_id,
    email: customer_email || "unknown",
    amount: amount_dollars,
    currency: (session.currency ?? "usd").toLowerCase(),
    product_type: (session.metadata?.product_type as string) || "payment",
    stripe_session_id: session_id,
    session_id: session_id,
    status: "completed",
    ...(payment_intent_id && {
      stripe_payment_intent: payment_intent_id,
      stripe_payment_intent_id: payment_intent_id,
    }),
  }).then(({ error }) => {
    if (error) console.error("[Stripe webhook] stripe_payments insert:", error.message);
  });

  return new Response("OK", { status: 200 });
}
