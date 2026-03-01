import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { getWalletSnapshot } from "@/lib/wallet-ledger";

/**
 * POST /api/wallet/fund
 * Create Stripe Checkout session to add money to user's wallet.
 * Body: { amountCents: number } (min 100 = $1)
 * On success (webhook): amount saved to Supabase, user balance updated, transaction ID stored.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const wallet = await getWalletSnapshot(userId);
  if (!wallet) {
    return NextResponse.json({ message: "Wallet not found" }, { status: 404 });
  }
  if (wallet.isBanned) {
    return NextResponse.json({ message: "Account is suspended" }, { status: 403 });
  }

  let body: { amountCents?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : 0;
  if (amountCents < 100) {
    return NextResponse.json({ message: "Minimum amount is $1.00 (100 cents)" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .single();

  const email = (userRow as { email?: string } | null)?.email;
  if (!email) {
    return NextResponse.json({ message: "User email not found" }, { status: 400 });
  }

  const base = getCheckoutBaseUrl(request);
  const successUrl = `${base}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}/payment-cancel`;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        email,
        product_type: "wallet_fund",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Wallet funding",
              description: "Add funds to your GarmonPay wallet",
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
  } catch (err) {
    console.error("Stripe wallet fund error:", err);
    const message = err instanceof Error ? err.message : "Failed to create checkout session";
    return NextResponse.json({ message }, { status: 500 });
  }
}
