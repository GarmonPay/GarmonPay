import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { MAX_PAYMENT_CENTS, MIN_WALLET_FUND_CENTS } from "@/lib/security";

/**
 * POST /api/wallet/deposit
 * Initiates Stripe Checkout for deposit. Credit is applied once in
 * `/api/stripe/webhook` on `checkout.session.completed` via `wallet_ledger_entry`
 * (reference `stripe_session_<id>` → `wallet_balances`). Metadata `product_type: wallet_deposit`.
 * Fraud: require strict auth (Bearer only).
 */
export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { amount?: number; amountCents?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const amountCents =
    typeof body.amountCents === "number"
      ? Math.round(body.amountCents)
      : typeof body.amount === "number"
        ? Math.round(body.amount * 100)
        : 0;

  if (!Number.isFinite(amountCents) || amountCents < MIN_WALLET_FUND_CENTS) {
    return NextResponse.json({ error: "Minimum amount is $5.00" }, { status: 400 });
  }
  if (amountCents > MAX_PAYMENT_CENTS) {
    return NextResponse.json(
      { error: `Maximum single payment is $${(MAX_PAYMENT_CENTS / 100).toFixed(2)}` },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const email = (userRow as { email?: string } | null)?.email;
  if (!email) {
    return NextResponse.json({ error: "User email not found" }, { status: 400 });
  }

  const base = getCheckoutBaseUrl(req);
  const successUrl = `${base}/wallet?success=true`;
  const cancelUrl = `${base}/wallet?canceled=true`;

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
        product_type: "wallet_deposit",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Wallet Deposit",
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Stripe failed";
    console.error("Wallet deposit (Stripe) error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
