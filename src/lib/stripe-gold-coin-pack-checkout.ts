/**
 * Shared Stripe Checkout for catalog Gold Coin packs (starter | basic | value | pro | elite).
 * Used by POST /api/stripe/gold-coins and POST /api/coins/checkout (canonical id path).
 */

import { getStripe } from "@/lib/stripe-server";
import { GOLD_COIN_PACKAGES, type GoldCoinPackageId } from "@/lib/gold-coin-packages";

export async function createGoldCoinPackCheckoutSession(params: {
  userId: string;
  email: string;
  packageId: GoldCoinPackageId;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | { error: string }> {
  const pkg = GOLD_COIN_PACKAGES[params.packageId];
  if (!pkg) {
    return { error: "Invalid package" };
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: params.email,
      client_reference_id: params.userId,
      metadata: {
        user_id: params.userId,
        email: params.email,
        product_type: "gold_coin_pack",
        package_id: pkg.package_id,
        gold_coins: String(pkg.gold_coins),
        price_cents: String(pkg.price_cents),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pkg.price_cents,
            product_data: {
              name: pkg.label ? `${pkg.label} Pack — Gold Coins` : "Gold Coins — Digital Pack",
              description: pkg.stripe_description,
            },
          },
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    if (!session.url) {
      return { error: "Checkout URL missing" };
    }
    return { url: session.url };
  } catch (e) {
    console.error("[createGoldCoinPackCheckoutSession]", e);
    return { error: "Checkout failed" };
  }
}
