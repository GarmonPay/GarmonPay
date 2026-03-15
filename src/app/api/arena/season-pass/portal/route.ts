import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getStripe, getCheckoutBaseUrl, isStripeConfigured } from "@/lib/stripe-server";

/** POST /api/arena/season-pass/portal — create Stripe Customer Portal session to manage/cancel subscription. */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!isStripeConfigured()) return NextResponse.json({ message: "Stripe not configured" }, { status: 503 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const { data: row } = await supabase
    .from("arena_season_pass")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  const subId = (row as { stripe_subscription_id?: string } | null)?.stripe_subscription_id;
  if (!subId) return NextResponse.json({ message: "No active season pass" }, { status: 400 });

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return NextResponse.json({ message: "No customer for subscription" }, { status: 400 });

  const baseUrl = getCheckoutBaseUrl(req);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/dashboard/arena/season-pass`,
  });

  return NextResponse.json({ url: session.url });
}
