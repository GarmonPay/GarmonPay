import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Create a Stripe Connect Express account for the user and return an onboarding link.
 * Saves stripe_account_id to users table. User completes onboarding at Stripe, then can receive payouts.
 */
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
    .select("email, stripe_account_id")
    .eq("id", userId)
    .single();

  const user = userRow as { email?: string; stripe_account_id?: string } | null;
  const email = user?.email;

  try {
    const stripe = getStripe();

    let accountId = user?.stripe_account_id;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "US",
        email: email ?? undefined,
        metadata: { user_id: userId },
      });
      accountId = account.id;
      await supabase
        .from("users")
        .update({ stripe_account_id: accountId, updated_at: new Date().toISOString() })
        .eq("id", userId);
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    const origin =
      (siteUrl && siteUrl.startsWith("http") ? siteUrl : null) ||
      (request.headers.get("x-forwarded-host")
        ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${request.headers.get("x-forwarded-host")}`
        : request.headers.get("origin")) ||
      "https://garmonpay.com";

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/dashboard/settings?stripe_refresh=1`,
      return_url: `${origin}/dashboard/settings?stripe_return=1`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url, accountId });
  } catch (err) {
    console.error("Stripe Connect onboard error:", err);
    const message = err instanceof Error ? err.message : "Failed to create onboarding link";
    return NextResponse.json({ message }, { status: 500 });
  }
}
