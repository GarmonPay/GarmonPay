/**
 * Simulate Stripe checkout.session.completed webhook for testing.
 * Verifies webhook endpoint and database updates (stripe_payments, deposits, transactions, users.balance).
 *
 * Usage:
 *   node --env-file=.env.local scripts/simulate-stripe-webhook.mjs
 *   node --env-file=.env.local scripts/simulate-stripe-webhook.mjs https://garmonpay.com/api/stripe/webhook
 *   TEST_USER_ID=uuid TEST_EMAIL=you@example.com node --env-file=.env.local scripts/simulate-stripe-webhook.mjs
 *
 * Requires: STRIPE_WEBHOOK_SECRET in env. Optional: TEST_USER_ID, TEST_EMAIL (must exist in public.users).
 * Uses a unique fake session id so it won't duplicate real payments; run against staging/local DB.
 */

import Stripe from "stripe";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const baseUrl = process.argv[2] || process.env.WEBHOOK_URL || "https://garmonpay.com/api/stripe/webhook";
const webhookUrl = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}/api/stripe/webhook`;
const testUserId = process.env.TEST_USER_ID || null;
const testEmail = process.env.TEST_EMAIL || "test-webhook@example.com";

if (!WEBHOOK_SECRET) {
  console.error("Set STRIPE_WEBHOOK_SECRET (e.g. in .env.local).");
  process.exit(1);
}

const sessionId = "cs_test_sim_" + Date.now();
const amountTotal = 999; // cents (unique test amount)

const event = {
  id: "evt_test_sim_" + Date.now(),
  type: "checkout.session.completed",
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: sessionId,
      payment_status: "paid",
      amount_total,
      currency: "usd",
      customer_email: testEmail,
      client_reference_id: testUserId,
      metadata: {
        user_id: testUserId || "",
        email: testEmail,
        product_type: "wallet_fund",
      },
    },
  },
};

const payload = JSON.stringify(event);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
let signature;
try {
  signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });
} catch (e) {
  console.error("Failed to generate signature:", e.message);
  process.exit(1);
}

console.log("POST", webhookUrl);
console.log("Session ID:", sessionId, "Amount (cents):", amountTotal, "Email:", testEmail, "User ID:", testUserId || "(lookup by email)");

const res = await fetch(webhookUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "stripe-signature": signature,
  },
  body: payload,
});

const text = await res.text();
console.log("Status:", res.status, res.statusText);
if (text) console.log("Body:", text);

if (res.ok) {
  console.log("\n✓ Webhook accepted. Check DB: public.stripe_payments, deposits, transactions, users.balance for session", sessionId);
} else {
  console.error("\n✗ Webhook failed. Fix errors above.");
  process.exit(1);
}
