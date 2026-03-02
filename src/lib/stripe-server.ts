/**
 * Backward-compatible re-export.
 * Prefer importing from "@/lib/stripe" in new code.
 */

export {
  getStripe,
  isStripeConfigured,
  getStripeWebhookSecret,
  getCheckoutBaseUrl,
  type StripeProductType,
} from "./stripe";
