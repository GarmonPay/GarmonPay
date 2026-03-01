import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
  if (!isStripeConfigured() || !webhookSecret) {
    return NextResponse.json({ message: "Webhook not configured" }, { status: 503 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ message: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("Stripe webhook signature error:", message);
    return NextResponse.json({ message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = (session.metadata?.user_id ?? session.client_reference_id) as string | null;
    const email = (session.customer_email ?? session.metadata?.email) as string;
    const productType = (session.metadata?.product_type as string) ?? "payment";
    const supabase = createAdminClient();

    if (session.mode === "subscription" && session.subscription) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const membershipTierRaw = String(session.metadata?.tier ?? "pro").toLowerCase();
      const membershipTier = membershipTierRaw === "vip" || membershipTierRaw === "starter" ? membershipTierRaw : "pro";
      if (supabase && userId) {
        try {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subId) as Stripe.Subscription;
          const priceId = sub.items.data[0]?.price?.id ?? null;
          const periodEnd = (sub as { current_period_end?: number }).current_period_end;
          await supabase.from("stripe_subscriptions").upsert(
            {
              user_id: userId,
              stripe_subscription_id: sub.id,
              stripe_price_id: priceId,
              status: sub.status as "active" | "past_due" | "canceled" | "incomplete" | "trialing",
              current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "stripe_subscription_id" }
          );
          await supabase.from("users").update({ membership: membershipTier, updated_at: new Date().toISOString() }).eq("id", userId);
        } catch (e) {
          console.error("Stripe webhook: subscription save error", e);
        }
      }
      return NextResponse.json({ received: true });
    }

    if (session.payment_status !== "paid") return NextResponse.json({ received: true });

    const amountTotal = session.amount_total ?? 0;
    const currency = (session.currency ?? "usd").toLowerCase();
    const sessionId = session.id;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null;
    const transactionId = paymentIntentId ?? sessionId;
    const allowedTypes = ["subscription", "platform_access", "upgrade", "payment", "wallet_fund"];
    // Backward compatibility: older add-funds sessions used product_type="payment".
    const shouldCreditWallet = !!userId && amountTotal > 0 && (productType === "wallet_fund" || productType === "payment");

    if (supabase) {
      let alreadyProcessed = false;
      const { data: existingPayment, error: existingPaymentError } = await supabase
        .from("stripe_payments")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();
      if (existingPaymentError) {
        console.error("Stripe webhook: lookup stripe_payments error", existingPaymentError);
      }
      if (existingPayment) {
        alreadyProcessed = true;
      }

      if (!alreadyProcessed) {
        const { error } = await supabase.from("stripe_payments").insert({
          user_id: userId || null,
          email: email || "unknown",
          amount_cents: amountTotal,
          currency,
          transaction_id: transactionId,
          stripe_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId,
          product_type: allowedTypes.includes(productType) ? productType : "payment",
          status: "completed",
        });
        if (error) {
          const duplicate = (error as { code?: string }).code === "23505";
          if (!duplicate) {
            console.error("Stripe webhook: insert stripe_payments error", error);
          }
          alreadyProcessed = duplicate;
        }
      }

      if (!alreadyProcessed && shouldCreditWallet) {
        const { error: rpcError } = await supabase.rpc("increment_user_balance", {
          p_user_id: userId,
          p_amount_cents: amountTotal,
        });
        if (rpcError) {
          console.error("Stripe webhook: increment_user_balance error", rpcError);
          const { data: userRow, error: userFetchError } = await supabase
            .from("users")
            .select("balance")
            .eq("id", userId)
            .single();
          if (!userFetchError && userRow) {
            const currentBalance = Number((userRow as { balance?: number }).balance ?? 0);
            const { error: updateError } = await supabase
              .from("users")
              .update({ balance: currentBalance + amountTotal, updated_at: new Date().toISOString() })
              .eq("id", userId);
            if (updateError) {
              console.error("Stripe webhook: fallback users.balance update error", updateError);
            }
          } else if (userFetchError) {
            console.error("Stripe webhook: fallback users.balance fetch error", userFetchError);
          }
        }

        const { error: txError } = await supabase.from("transactions").insert({
          user_id: userId,
          type: "deposit",
          amount: amountTotal,
          status: "completed",
          description: `Stripe checkout ${sessionId}`,
          reference_id: sessionId,
        });
        if (txError) {
          console.error("Stripe webhook: insert transactions deposit error", txError);
        }
      }
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription & { current_period_end?: number };
    const supabase = createAdminClient();
    if (supabase) {
      const userId = sub.metadata?.user_id as string | undefined;
      const status = sub.status;
      const periodEnd = sub.current_period_end;
      await supabase
        .from("stripe_subscriptions")
        .update({
          status: status as "active" | "past_due" | "canceled" | "incomplete" | "trialing",
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id);
      if (userId && (status === "canceled" || status === "unpaid" || status === "incomplete_expired")) {
        await supabase.from("users").update({ membership: "starter", updated_at: new Date().toISOString() }).eq("id", userId);
      }
    }
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const supabase = createAdminClient();
    if (supabase && account.metadata?.user_id) {
      await supabase
        .from("users")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", account.metadata.user_id);
    }
  }

  return NextResponse.json({ received: true });
}
