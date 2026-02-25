import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";

const PRO_MONTHLY_CENTS = 1000;

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
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
      mode: "subscription",
      customer_email: email,
      client_reference_id: userId,
      metadata: { user_id: userId, email, product_type: "subscription" },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "GarmonPay Pro",
              description: "Premium subscription — $10/month",
            },
            unit_amount: 1000,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: { metadata: { user_id: userId } },
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("Stripe subscribe error:", err);
    const message = err instanceof Error ? err.message : "Failed to create subscription session";
    return NextResponse.json({ message }, { status: 500 });
  }
}
