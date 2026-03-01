import { NextResponse } from "next/server";
import { getSupabaseAuthUser } from "@/lib/auth-request";
import { getStripe, getCheckoutBaseUrl, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/wallet/deposit
 * Creates Stripe Checkout session for wallet deposit.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const authUser = await getSupabaseAuthUser(request);
  if (!authUser) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { amount?: number; amountCents?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  let amountCents = 0;
  if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) {
    amountCents = Math.round(body.amountCents);
  } else if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    amountCents = Math.round(body.amount * 100);
  }

  if (amountCents < 100) {
    return NextResponse.json({ message: "Minimum deposit is $1.00" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  let email = authUser.email;
  if (!email) {
    const { data: user } = await supabase
      .from("users")
      .select("email")
      .eq("id", authUser.id)
      .maybeSingle();
    email = (user as { email?: string } | null)?.email ?? null;
  }
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
      client_reference_id: authUser.id,
      metadata: {
        user_id: authUser.id,
        email,
        product_type: "wallet_fund",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "GarmonPay Wallet Deposit",
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session";
    return NextResponse.json({ message }, { status: 500 });
  }
}
