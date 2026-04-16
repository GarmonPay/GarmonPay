import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { getGoldCoinPackage, type GoldCoinPackageId } from "@/lib/gold-coin-packages";

/**
 * POST /api/stripe/gold-coins
 * Body: { packageId: GoldCoinPackageId } — Stripe Checkout for Gold Coins only.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { packageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const packageId = typeof body.packageId === "string" ? body.packageId.trim() : "";
  const pkg = getGoldCoinPackage(packageId);
  if (!pkg) {
    return NextResponse.json({ error: "Invalid package" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: userRow } = await supabase.from("users").select("email").eq("id", userId).maybeSingle();
  const email = (userRow as { email?: string } | null)?.email;
  if (!email) {
    return NextResponse.json({ error: "User email not found" }, { status: 400 });
  }

  const base = getCheckoutBaseUrl(request);
  const successUrl = `${base}/dashboard/wallet?purchased=true`;
  const cancelUrl = `${base}/dashboard/wallet?canceled=1`;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        email,
        product_type: "gold_coin_pack",
        package_id: pkg.package_id as GoldCoinPackageId,
        gold_coins: String(pkg.gold_coins),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pkg.price_cents,
            product_data: {
              name: `Gold Coins — Digital Pack`,
              description: pkg.stripe_description,
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Checkout URL missing" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[stripe/gold-coins]", e);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
