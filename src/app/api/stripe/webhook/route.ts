import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import Stripe from "stripe";

/**
 * Stripe webhook — use this URL in Stripe Dashboard (Developers → Webhooks):
 *   https://garmonpay.com/api/stripe/webhook
 * Do not use the file path (e.g. .../src/app/api/stripe/webhook/route.ts).
 */
export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim().replace(/^["']|["']$/g, "").split("\n")[0]?.trim() ?? "";

export async function GET() {
  return NextResponse.json({ status: "live" });
}

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    console.error("[Stripe webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook secret missing", { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    console.error("[Stripe webhook] Missing stripe-signature header");
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const arrayBuffer = await req.arrayBuffer();
  const body = Buffer.from(arrayBuffer);

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

  const eventId = event.id;
  const eventType = event.type;

  if (eventType === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    console.warn("[Stripe webhook] payment_intent.payment_failed", {
      eventId,
      paymentIntentId: pi.id,
      amount: pi.amount,
      lastError: pi.last_payment_error?.message,
    });
    return new Response("OK", { status: 200 });
  }

  if (eventType === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const supabasePi = createAdminClient();
    if (!supabasePi) return new Response("OK", { status: 200 });
    const { data: existingTx } = await supabasePi.from("transactions").select("id").eq("reference_id", pi.id).eq("type", "deposit").maybeSingle();
    if (existingTx) return new Response("OK", { status: 200 });
    const { data: existingSp } = await supabasePi.from("stripe_payments").select("id").eq("stripe_payment_intent_id", pi.id).maybeSingle();
    if (existingSp) return new Response("OK", { status: 200 });
    const amountTotal = pi.amount ?? 0;
    if (amountTotal <= 0) return new Response("OK", { status: 200 });
    const metadata = (pi.metadata ?? {}) as Record<string, string>;
    let user_id_pi: string | null = metadata?.user_id ?? metadata?.userId ?? null;
    const customerEmail = (metadata?.email as string) ?? "";
    if (!user_id_pi && customerEmail) {
      const { data: u } = await supabasePi.from("users").select("id").eq("email", customerEmail).maybeSingle();
      if (u && (u as { id?: string }).id) user_id_pi = (u as { id: string }).id;
      if (!user_id_pi) {
        const { data: p } = await supabasePi.from("profiles").select("id").eq("email", customerEmail).maybeSingle();
        if (p && (p as { id?: string }).id) user_id_pi = (p as { id: string }).id;
      }
    }
    if (!user_id_pi) {
      console.warn("[Stripe webhook] payment_intent.succeeded no user", { eventId, paymentIntentId: pi.id });
      return new Response("OK", { status: 200 });
    }
    const { data: userRowPi } = await supabasePi.from("users").select("balance, total_deposits").eq("id", user_id_pi).maybeSingle();
    const cur = (userRowPi as { balance?: number; total_deposits?: number }) ?? {};
    const newBalance = Number(cur.balance ?? 0) + amountTotal;
    const newTotalDeposits = Number(cur.total_deposits ?? 0) + amountTotal;
    const { error: upErr } = await supabasePi.from("users").update({ balance: newBalance, total_deposits: newTotalDeposits, updated_at: new Date().toISOString() }).eq("id", user_id_pi);
    if (upErr) {
      console.error("[Stripe webhook] payment_intent.succeeded balance update failed:", upErr);
      return new Response("OK", { status: 200 });
    }
    const { data: walletRowPi } = await supabasePi.from("wallet").select("balance").eq("user_id", user_id_pi).maybeSingle();
    const newWalletBalancePi = Number((walletRowPi as { balance?: number } | null)?.balance ?? 0) + amountTotal;
    await supabasePi.from("wallet").upsert({
      user_id: user_id_pi,
      balance: newWalletBalancePi,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }).then(({ error }) => {
      if (error) console.error("[Stripe webhook] payment_intent.succeeded wallet upsert:", error.message);
    });
    await supabasePi.from("transactions").insert({ user_id: user_id_pi, type: "deposit", amount: amountTotal, stripe_session: pi.id, status: "completed", description: `Stripe payment_intent ${pi.id}`, reference_id: pi.id }).then(({ error }) => { if (error) console.error("[Stripe webhook] payment_intent.succeeded tx insert:", error.message); });
    await supabasePi.from("stripe_payments").insert({ user_id: user_id_pi, email: customerEmail || "unknown", amount: amountTotal / 100, currency: (pi.currency ?? "usd").toLowerCase(), status: "completed", stripe_payment_intent_id: pi.id }).then(({ error }) => { if (error) console.error("[Stripe webhook] payment_intent.succeeded stripe_payments insert:", error.message); });
    console.log("[Stripe webhook] payment_intent.succeeded credited", { eventId, user_id: user_id_pi, amountTotal });
    return new Response("OK", { status: 200 });
  }

  if (eventType !== "checkout.session.completed") {
    return new Response("OK", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const amount_total = session.amount_total ?? 0;

  if (session.payment_status !== "paid" || amount_total <= 0) {
    return new Response("OK", { status: 200 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    console.error("[Stripe webhook] Supabase admin client unavailable");
    return new Response("Database unavailable", { status: 500 });
  }

  const { data: existingPayment } = await supabase.from("stripe_payments").select("id").eq("stripe_session_id", session.id).maybeSingle();
  if (existingPayment) {
    return new Response("OK", { status: 200 });
  }

  let user_id: string | null =
    (session.metadata?.user_id ?? session.metadata?.userId ?? session.client_reference_id) as string | null;

  const customer_email =
    (session.customer_email as string) ?? (session.metadata?.email as string) ?? "";

  if (!user_id) {
    const customer_email =
      (session.customer_email as string) ??
      (session.metadata?.email as string) ??
      "";
    if (customer_email) {
      const { data: userRow } = await supabase.from("users").select("id").eq("email", customer_email).maybeSingle();
      if (userRow && typeof (userRow as { id?: string }).id === "string") {
        user_id = (userRow as { id: string }).id;
      }
    }
    if (!user_id) {
      const { data: profileRow } = await supabase.from("profiles").select("id").eq("email", customer_email).maybeSingle();
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

  const { data: userRow } = await supabase.from("users").select("balance, total_deposits").eq("id", user_id).maybeSingle();

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
  console.log("[Stripe webhook] Balance credited — user_id:", user_id, "amount_cents:", amount_total, "eventId:", eventId);

  const { data: walletRow } = await supabase.from("wallet").select("balance").eq("user_id", user_id).maybeSingle();
  const newWalletBalance = Number((walletRow as { balance?: number } | null)?.balance ?? 0) + amount_total;
  await supabase.from("wallet").upsert({
    user_id,
    balance: newWalletBalance,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" }).then(({ error }) => {
    if (error) console.error("[Stripe webhook] wallet upsert:", error.message);
  });

  await supabase.from("transactions").insert({
    user_id,
    type: "deposit",
    amount: amount_total,
    stripe_session: session_id,
    status: "completed",
    description: `Stripe checkout ${session_id}`,
    reference_id: session_id,
  }).then(({ error }) => {
    if (error) console.error("[Stripe webhook] transactions insert:", error.message);
  });

  const { data: existingDeposit } = await supabase.from("deposits").select("id").or(`stripe_session.eq.${session_id},stripe_session_id.eq.${session_id}`).maybeSingle();

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
