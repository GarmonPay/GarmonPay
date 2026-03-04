import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Legacy webhook: use CENTS for balance/transactions so dashboard and main webhook stay in sync. */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    console.error("Webhook signature missing");
    return new NextResponse("Webhook signature required", { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return new NextResponse("Webhook not configured", { status: 503 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("Webhook signature verification failed:", message);
    return new NextResponse("Webhook error", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id ?? (session.client_reference_id as string | null);

    if (!userId) {
      console.error("No user_id in metadata or client_reference_id");
      return NextResponse.json({ received: true });
    }

    const amountTotalCents = session.amount_total ?? 0;
    if (session.payment_status !== "paid" || amountTotalCents <= 0) {
      return NextResponse.json({ received: true });
    }

    const amountDollars = amountTotalCents / 100;
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;
    const email =
      session.customer_email ??
      (session.customer_details as { email?: string } | null)?.email ??
      null;

    const sessionId = session.id;

    // 1) stripe_payments (amount in dollars for this table's schema if needed, or cents per your schema)
    await supabase.from("stripe_payments").insert({
      user_id: userId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_payment_intent: paymentIntentId,
      amount: amountDollars,
      email,
      status: "completed",
      stripe_session_id: sessionId,
    }).then(({ error }) => {
      if (error) console.error("[Stripe webhook legacy] stripe_payments insert:", error.message);
    });

    // 2) deposits table (amount in dollars)
    await supabase.from("deposits").insert({
      user_id: userId,
      amount: amountDollars,
      stripe_session_id: sessionId,
      stripe_session: sessionId,
      status: "completed",
    }).then(({ error }) => {
      if (error) console.error("[Stripe webhook legacy] deposits insert:", error.message);
    });

    // 3) transactions table (amount in CENTS so dashboard totals match)
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount: amountTotalCents,
      status: "completed",
      description: `Stripe checkout ${sessionId}`,
      reference_id: sessionId,
    }).then(({ error }) => {
      if (error) console.error("[Stripe webhook legacy] transactions insert:", error.message);
    });

    // 4) users.balance and total_deposits in CENTS (dashboard reads balance as cents)
    const { data: user } = await supabase
      .from("users")
      .select("balance, total_deposits")
      .eq("id", userId)
      .single();

    if (user) {
      const balanceCents = Number(user.balance ?? 0) + amountTotalCents;
      const totalDeposits = Number(user.total_deposits ?? 0) + amountTotalCents;
      await supabase
        .from("users")
        .update({
          balance: balanceCents,
          total_deposits: totalDeposits,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    }
  }

  return NextResponse.json({ received: true });
}
