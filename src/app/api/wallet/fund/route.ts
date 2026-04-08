import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { MAX_PAYMENT_CENTS, MIN_WALLET_FUND_CENTS } from "@/lib/security";

/**
 * POST /api/wallet/fund
 * Alternate checkout entry for wallet top-up (same canonical path as `/api/wallet/deposit`).
 * Webhook: `checkout.session.completed` → `wallet_ledger_entry` with `product_type: wallet_fund`.
 * Body: { amountCents: number } (min $5)
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { amountCents?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : 0;
  if (amountCents < MIN_WALLET_FUND_CENTS) {
    return NextResponse.json({ message: "Minimum amount is $5.00" }, { status: 400 });
  }
  if (amountCents > MAX_PAYMENT_CENTS) {
    return NextResponse.json(
      { message: `Maximum amount is $${(MAX_PAYMENT_CENTS / 100).toFixed(2)}` },
      { status: 400 }
    );
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
