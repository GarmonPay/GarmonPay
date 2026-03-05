/**
 * Canonical Stripe server helpers.
 * Uses only STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.
 */

import Stripe from "stripe";

let stripe: Stripe | null = null;

export type StripeProductType = "subscription" | "platform_access" | "upgrade" | "payment" | "wallet_fund";

export function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!stripe) stripe = new Stripe(secret);
  return stripe;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET ?? null;
}

export function getCheckoutBaseUrl(request: Request): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && typeof siteUrl === "string" && siteUrl.startsWith("http")) {
    return siteUrl.replace(/\/$/, "");
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "garmonpay.com";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
