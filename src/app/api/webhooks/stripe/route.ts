import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import Stripe from "stripe";
import { POST as handleStripeWebhookLegacy } from "@/app/api/stripe-webhook/route";

/** Use Node.js runtime for Stripe webhook (required by Stripe SDK). */
export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/** GET /api/webhooks/stripe — health check for Stripe webhook endpoint. */
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

  console.log("[Stripe webhook] Event received:", event.type, "id:", event.id);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const customer_email =
      (session.customer_email as string) ??
      (session.metadata?.email as string) ??
      "";
    const amount_total = session.amount_total ?? 0;

    console.log("[Stripe webhook] checkout.session.completed — email:", customer_email, "amount_total:", amount_total);

    if (session.payment_status !== "paid") {
      console.log("[Stripe webhook] Payment not paid, skipping deposit");
      return new Response("OK", { status: 200 });
    }

    if (!amount_total || amount_total <= 0) {
      console.log("[Stripe webhook] amount_total is 0, skipping deposit");
      return new Response("OK", { status: 200 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      console.error("[Stripe webhook] Supabase admin client unavailable (SUPABASE_SERVICE_ROLE_KEY?)");
      return new Response("Database unavailable", { status: 500 });
    }

    let user_id: string | null = null;

    if (customer_email) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", customer_email)
        .maybeSingle();
      if (profileError) {
        console.error("[Stripe webhook] Lookup profiles by email error:", profileError);
      }
      if (profile && typeof (profile as { id?: string }).id === "string") {
        user_id = (profile as { id: string }).id;
      }
      if (!user_id) {
        const { data: user, error: userError } = await supabase
          .from("users")
          .select("id")
          .eq("email", customer_email)
          .maybeSingle();
        if (userError) {
          console.error("[Stripe webhook] Lookup users by email error:", userError);
        }
        if (user && typeof (user as { id?: string }).id === "string") {
          user_id = (user as { id: string }).id;
        }
      }
    }

    if (!user_id) {
      user_id = (session.metadata?.user_id ?? session.client_reference_id) as string | null;
    }

    if (!user_id) {
      console.error("[Stripe webhook] No user found for email:", customer_email);
      return new Response("OK", { status: 200 });
    }

    const session_id = session.id;
    const amount_dollars = amount_total / 100;
    const payment_intent_id =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;

    // Duplicate check: deposits (by stripe_session or stripe_session_id)
    const { data: existingDeposit } = await supabase
      .from("deposits")
      .select("id")
      .or(`stripe_session.eq.${session_id},stripe_session_id.eq.${session_id}`)
      .maybeSingle();
    if (existingDeposit) {
      console.log("[Stripe webhook] Deposit already exists for session:", session_id);
      return new Response("OK", { status: 200 });
    }

    // 1) stripe_payments — try current schema (amount in dollars, stripe_session_id) then legacy (amount_cents, transaction_id)
    const stripePaymentRow: Record<string, unknown> = {
      user_id: user_id,
      email: customer_email || "unknown",
      amount: amount_dollars,
      currency: (session.currency ?? "usd").toLowerCase(),
      product_type: (session.metadata?.product_type as string) || "payment",
      stripe_session_id: session_id,
      session_id: session_id,
      status: "completed",
    };
    if (payment_intent_id) {
      stripePaymentRow.stripe_payment_intent = payment_intent_id;
      stripePaymentRow.stripe_payment_intent_id = payment_intent_id;
    }
    const { error: stripePaymentError } = await supabase.from("stripe_payments").insert(stripePaymentRow);
    if (stripePaymentError) {
      const err = stripePaymentError as { code?: string; message?: string };
      const code = err.code;
      if (code === "23505") {
        console.log("[Stripe webhook] stripe_payments already has session:", session_id);
      } else if (code === "42703" || (err.message && err.message.includes("column"))) {
        const { error: legacyErr } = await supabase.from("stripe_payments").insert({
          user_id,
          email: customer_email || "unknown",
          amount_cents: amount_total,
          currency: (session.currency ?? "usd").toLowerCase(),
          product_type: (session.metadata?.product_type as string) || "payment",
          stripe_session_id: session_id,
          stripe_payment_intent_id: payment_intent_id,
          transaction_id: payment_intent_id ?? session_id,
          status: "completed",
        });
        if (legacyErr) {
          console.error("[Stripe webhook] stripe_payments insert (legacy) error:", legacyErr);
          return new Response("stripe_payments insert failed", { status: 500 });
        }
      } else {
        console.error("[Stripe webhook] stripe_payments insert error:", stripePaymentError);
        return new Response("stripe_payments insert failed", { status: 500 });
      }
    }

    // 2) deposits — both stripe_session and stripe_session_id for compatibility
    const { error: depositError } = await supabase.from("deposits").insert({
      user_id,
      amount: amount_dollars,
      stripe_session: session_id,
      stripe_session_id: session_id,
      status: "completed",
    });

    if (depositError) {
      console.error("[Stripe webhook] Deposit insert error:", depositError);
      return new Response("Deposit save failed", { status: 500 });
    }

    console.log("[Stripe webhook] Deposit saved — user_id:", user_id, "amount:", amount_dollars, "session:", session_id);

    // 3) transactions
    const { error: txErr } = await supabase.from("transactions").insert({
      user_id,
      type: "deposit",
      amount: amount_total,
      status: "completed",
      description: `Stripe checkout ${session_id}`,
      reference_id: session_id,
    });
    if (txErr) {
      console.error("[Stripe webhook] transactions insert error:", txErr);
    }

    // 4) Credit user balance in public.users (required for production)
    const { error: rpcErr } = await supabase.rpc("increment_user_balance", {
      p_user_id: user_id,
      p_amount_cents: amount_total,
    });
    if (rpcErr) {
      const { data: u } = await supabase.from("users").select("balance").eq("id", user_id).maybeSingle();
      const cur = Number((u as { balance?: number } | null)?.balance ?? 0);
      const { error: updateErr } = await supabase
        .from("users")
        .update({ balance: cur + amount_total, updated_at: new Date().toISOString() })
        .eq("id", user_id);
      if (updateErr) {
        console.error("[Stripe webhook] users.balance update error:", updateErr);
        return new Response("Balance update failed", { status: 500 });
      }
    }
    console.log("[Stripe webhook] users.balance credited for user:", user_id);

    // 5) total_deposits on users
    const { data: userTotals } = await supabase.from("users").select("total_deposits").eq("id", user_id).maybeSingle();
    const prevTotal = Number((userTotals as { total_deposits?: number } | null)?.total_deposits ?? 0);
    await supabase.from("users").update({ total_deposits: prevTotal + amount_total, updated_at: new Date().toISOString() }).eq("id", user_id);

    // 6) Optional: profiles.balance for backwards compatibility
    const { data: profileRow, error: profileSelectError } = await supabase
      .from("profiles")
      .select("id, balance")
      .eq("id", user_id)
      .maybeSingle();
    if (!profileSelectError && profileRow) {
      const currentBalance = Number((profileRow as { balance?: number }).balance ?? 0);
      await supabase.from("profiles").update({ balance: currentBalance + amount_total }).eq("id", user_id);
    }

    return new Response("OK", { status: 200 });
  }

  if (isStripeConfigured()) {
    const forwarded = new Request(req.url, {
      method: "POST",
      body,
      headers: { "stripe-signature": sig, "content-type": req.headers.get("content-type") ?? "application/json" },
    });
    return handleStripeWebhookLegacy(forwarded);
  }

  return new Response("OK", { status: 200 });
}
