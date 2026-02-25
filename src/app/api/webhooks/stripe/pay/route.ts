import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/stripe/pay
 * Create Stripe Checkout for one-time payment.
 * Body: { amountCents: number, name?: string }
 * On success (webhook): payment amount, user ID, transaction ID saved to stripe_payments.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { amountCents?: number; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : 0;
  if (amountCents < 50) {
    return NextResponse.json({ message: "Minimum amount is $0.50 (50 cents)" }, { status: 400 });
  }

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "One-time payment";

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
        product_type: "payment",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name,
              description: "One-time purchase",
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
    console.error("Stripe pay error:", err);
    const message = err instanceof Error ? err.message : "Failed to create checkout session";
    return NextResponse.json({ message }, { status: 500 });
  }
}
