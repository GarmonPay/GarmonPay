import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase";
import { recordSuccessfulDeposit } from "@/lib/deposits-db";

function getEmail(session: Stripe.Checkout.Session): string {
  return (
    session.customer_details?.email ??
    session.customer_email ??
    (session.metadata?.email as string | undefined) ??
    ""
  );
}

export async function handleStripeCheckoutDeposit(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return;
  }

  const productType = String(session.metadata?.product_type ?? "payment");
  if (!["wallet_fund", "payment"].includes(productType)) {
    return;
  }

  const amountTotal = Number(session.amount_total ?? 0);
  if (!Number.isFinite(amountTotal) || amountTotal <= 0) {
    return;
  }

  const userId = (session.metadata?.user_id ?? session.client_reference_id ?? "").trim();
  if (!userId) {
    return;
  }

  const email = getEmail(session);
  const currency = String(session.currency ?? "usd").toLowerCase();
  const stripeSessionId = session.id;
  const stripePaymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const result = await recordSuccessfulDeposit({
    userId,
    email,
    amountCents: Math.round(amountTotal),
    currency,
    stripeSessionId,
    stripePaymentIntentId,
  });

  if (!result.inserted) return;

  const admin = createAdminClient();
  if (!admin) return;

  await admin.from("revenue_transactions").insert({
    email,
    amount: amountTotal / 100,
    type: "payment",
  });
}
