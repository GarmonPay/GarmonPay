import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { getGarmonAdById } from "@/lib/garmon-ads-db";
import { createAdminClient } from "@/lib/supabase";

const MIN_BUDGET_DOLLARS = 5;
const MAX_BUDGET_DOLLARS = 10_000;

/**
 * POST /api/ads/deposit/checkout — Create Stripe Checkout session for ad budget.
 * Body: { adId: string, amount: number } (amount in dollars).
 * Webhook credits ad budget and activates ad; user wallet is not credited.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { adId: string; amount: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { adId, amount } = body;
  if (!adId || typeof amount !== "number" || amount < MIN_BUDGET_DOLLARS) {
    return NextResponse.json(
      { message: `adId and amount (min $${MIN_BUDGET_DOLLARS}) required` },
      { status: 400 }
    );
  }
  if (amount > MAX_BUDGET_DOLLARS) {
    return NextResponse.json(
      { message: `Maximum single deposit $${MAX_BUDGET_DOLLARS}` },
      { status: 400 }
    );
  }

  const ad = await getGarmonAdById(adId);
  if (!ad) {
    return NextResponse.json({ message: "Ad not found" }, { status: 404 });
  }
  if (ad.user_id !== userId) {
    return NextResponse.json({ message: "Not your ad" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data: userRow } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  const email = (userRow as { email?: string } | null)?.email ?? "";

  const base = getCheckoutBaseUrl(request);
  const successUrl = `${base}/dashboard/advertise?success=1&adId=${encodeURIComponent(adId)}`;
  const cancelUrl = `${base}/dashboard/advertise?canceled=1`;

  const amountCents = Math.round(amount * 100);

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email || undefined,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        product_type: "ad_deposit",
        ad_id: adId,
        amount_dollars: String(amount),
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "GarmonPay Ad Budget",
              description: `Add $${amount.toFixed(2)} to ad: ${ad.title?.slice(0, 50) ?? "Ad"}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Stripe failed";
    console.error("Ad deposit checkout error:", e);
    return NextResponse.json({ message }, { status: 500 });
  }
}
