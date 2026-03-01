import Stripe from "stripe";
import { env } from "../config/env";
import { HttpError } from "../lib/http-error";
import { applyStripeDeposit } from "./wallet.service";

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new HttpError(503, "Stripe is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover"
    });
  }
  return stripeClient;
}

export async function createCheckoutSession(input: {
  userId: string;
  email: string;
  amount: number;
  successUrl: string;
  cancelUrl: string;
}) {
  const stripe = getStripeClient();
  const amount = Math.round(input.amount);
  if (amount < 50) {
    throw new HttpError(400, "Minimum deposit is $0.50");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    client_reference_id: input.userId,
    metadata: {
      user_id: input.userId
    },
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          product_data: {
            name: "GarmonPay Wallet Deposit"
          },
          unit_amount: amount
        }
      }
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl
  });

  return { id: session.id, url: session.url };
}

export async function processStripeWebhook(rawBody: string, signature: string | null): Promise<void> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new HttpError(503, "Stripe webhook secret not configured");
  }
  if (!signature) {
    throw new HttpError(400, "Missing Stripe signature");
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    throw new HttpError(400, "Invalid webhook signature", error);
  }

  if (event.type !== "checkout.session.completed") {
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const amountTotal = session.amount_total ?? 0;
  if (amountTotal <= 0) return;

  const userId =
    session.metadata?.user_id ??
    session.client_reference_id ??
    null;

  if (!userId) {
    throw new HttpError(400, "Missing user metadata on Stripe session");
  }

  await applyStripeDeposit({
    userId,
    amount: amountTotal,
    stripeSessionId: session.id,
    metadata: {
      stripePaymentStatus: session.payment_status,
      stripeCustomer: session.customer,
      stripeCurrency: session.currency
    }
  });
}
