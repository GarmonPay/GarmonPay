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
    const metadataUserId = (session.metadata?.user_id ?? session.client_reference_id) as string | null;
    const customerEmail = String(session.customer_email ?? session.metadata?.email ?? "")
      .trim()
      .toLowerCase();
    const productType = (session.metadata?.product_type as string) ?? "payment";
    const supabase = createAdminClient();

    if (session.mode === "subscription" && session.subscription) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const membershipTierRaw = String(session.metadata?.tier ?? "pro").toLowerCase();
      const membershipTier = membershipTierRaw === "vip" || membershipTierRaw === "starter" ? membershipTierRaw : "pro";
      if (supabase && metadataUserId) {
        try {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subId) as Stripe.Subscription;
          const priceId = sub.items.data[0]?.price?.id ?? null;
          const periodEnd = (sub as { current_period_end?: number }).current_period_end;
          await supabase.from("stripe_subscriptions").upsert(
            {
              user_id: metadataUserId,
              stripe_subscription_id: sub.id,
              stripe_price_id: priceId,
              status: sub.status as "active" | "past_due" | "canceled" | "incomplete" | "trialing",
              current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "stripe_subscription_id" }
          );
          await supabase.from("users").update({ membership: membershipTier, updated_at: new Date().toISOString() }).eq("id", metadataUserId);
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

    if (supabase) {
      let resolvedUserId: string | null = metadataUserId;
      if (customerEmail) {
        const byEmail = await supabase
          .from("users")
          .select("id")
          .ilike("email", customerEmail)
          .maybeSingle();
        if (byEmail.data?.id) {
          resolvedUserId = (byEmail.data as { id: string }).id;
        } else if (byEmail.error) {
          console.error("Stripe webhook: user lookup by email error", byEmail.error);
        }
      }

      // Backward compatibility: older add-funds sessions used product_type="payment".
      const shouldCreditWallet =
        !!resolvedUserId &&
        amountTotal > 0 &&
        (productType === "wallet_fund" || productType === "payment");

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
          user_id: resolvedUserId || null,
          email: customerEmail || "unknown",
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
        const walletUserId = resolvedUserId as string;
        let currentBalance = 0;
        let currentTotalDeposits = 0;
        let hasTotalDeposits = true;

        const userWithTotals = await supabase
          .from("users")
          .select("balance, total_deposits")
          .eq("id", walletUserId)
          .maybeSingle();

        if (!userWithTotals.error && userWithTotals.data) {
          currentBalance = Number((userWithTotals.data as { balance?: number }).balance ?? 0);
          currentTotalDeposits = Number((userWithTotals.data as { total_deposits?: number }).total_deposits ?? 0);
        } else {
          hasTotalDeposits = false;
          if (userWithTotals.error) {
            console.error("Stripe webhook: users(balance,total_deposits) fetch error", userWithTotals.error);
          }
          const fallback = await supabase
            .from("users")
            .select("balance")
            .eq("id", walletUserId)
            .maybeSingle();
          if (!fallback.error && fallback.data) {
            currentBalance = Number((fallback.data as { balance?: number }).balance ?? 0);
          } else {
            console.error("Stripe webhook: users(balance) fetch error", fallback.error);
          }
        }

        if (currentBalance || currentBalance === 0) {
          const updatePayload: Record<string, unknown> = {
            balance: currentBalance + amountTotal,
            updated_at: new Date().toISOString(),
          };
          if (hasTotalDeposits) {
            updatePayload.total_deposits = currentTotalDeposits + amountTotal;
          }

          const updateUser = await supabase
            .from("users")
            .update(updatePayload)
            .eq("id", walletUserId);
          if (updateUser.error && hasTotalDeposits) {
            // Retry for environments where total_deposits column may not yet exist.
            const fallbackUpdate = await supabase
              .from("users")
              .update({
                balance: currentBalance + amountTotal,
                updated_at: new Date().toISOString(),
              })
              .eq("id", walletUserId);
            if (fallbackUpdate.error) {
              console.error("Stripe webhook: users balance update fallback error", fallbackUpdate.error);
            }
          } else if (updateUser.error) {
            console.error("Stripe webhook: users update error", updateUser.error);
          }
        }

        const { error: txError } = await supabase.from("transactions").insert({
          user_id: walletUserId,
          type: "deposit",
          amount: amountTotal,
          status: "completed",
          description: `Stripe checkout ${sessionId}`,
          reference_id: sessionId,
        });
        if (txError) {
          console.error("Stripe webhook: insert transactions deposit error", txError);
        }

        await supabase
          .from("deposits")
          .insert({
            user_id: walletUserId,
            amount: amountTotal,
            status: "completed",
            stripe_session: sessionId,
          });
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
