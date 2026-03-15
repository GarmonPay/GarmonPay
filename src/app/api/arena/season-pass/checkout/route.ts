import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getStripe, getCheckoutBaseUrl, isStripeConfigured } from "@/lib/stripe-server";

/** POST /api/arena/season-pass/checkout — create Stripe Checkout subscription session ($9.99/mo). */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ message: "Stripe not configured" }, { status: 503 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const { data: userRow } = await supabase.from("users").select("email").eq("id", userId).single();
  const email = (userRow as { email?: string } | null)?.email;
  if (!email) return NextResponse.json({ message: "User email not found" }, { status: 400 });

  const baseUrl = getCheckoutBaseUrl(req);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    customer_email: email,
    client_reference_id: userId,
    metadata: { user_id: userId, email, product_type: "arena_season_pass" },
    subscription_data: {
      metadata: { product_type: "arena_season_pass", user_id: userId },
      trial_period_days: 0,
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "Arena Season Pass", description: "Double login coins, extra spin, 10% store discount, VIP access, exclusive title. Cancel anytime." },
          unit_amount: 999,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/dashboard/arena?season_pass=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/dashboard/arena/season-pass`,
  });

  return NextResponse.json({ url: session.url });
}
