import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getCheckoutBaseUrl } from "@/lib/stripe-server";
import { type MarketingPlanId } from "@/lib/garmon-plan-config";
import { getMembershipPriceId, isPlaceholderPriceId, type PaidMembershipTier } from "@/lib/membership-price-ids";

const PAID_TIERS: MarketingPlanId[] = ["starter", "growth", "pro", "elite"];

function normalizeMembershipTier(raw: string | undefined): MarketingPlanId | null {
  const t = (raw ?? "").toLowerCase().trim();
  if (t === "vip") return "elite";
  if (PAID_TIERS.includes(t as MarketingPlanId)) return t as MarketingPlanId;
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret?.startsWith("sk_")) {
    return NextResponse.json(
      { error: "Stripe is not configured", url: null },
      { status: 503 }
    );
  }

  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized", url: null }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable", url: null }, { status: 503 });
  }
  const { data: userRow } = await supabase.from("users").select("email").eq("id", userId).single();
  const email = (userRow as { email?: string } | null)?.email;
  if (!email) {
    return NextResponse.json({ error: "User email not found", url: null }, { status: 400 });
  }

  const stripe = new Stripe(secret, {
    apiVersion: "2026-01-28.clover",
  });

  let tierRaw = "";
  try {
    const body = await req.json();
    tierRaw = (body as { tier?: string })?.tier ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body", url: null }, { status: 400 });
  }

  const tierId = normalizeMembershipTier(tierRaw);
  if (!tierId) {
    return NextResponse.json(
      {
        error: "Invalid tier. Use starter, growth, pro, or elite.",
        url: null,
      },
      { status: 400 }
    );
  }

  const priceId = getMembershipPriceId(tierId as PaidMembershipTier);
  if (!priceId || isPlaceholderPriceId(priceId)) {
    return NextResponse.json(
      { error: `Stripe price ID missing for ${tierId}. Set ${tierId.toUpperCase()} monthly price env.`, url: null },
      { status: 503 }
    );
  }

  const baseUrl = getCheckoutBaseUrl(req);

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: email,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        email,
        product_type: "membership_upgrade",
        membership_tier: tierId,
        tier: tierId,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard?upgraded=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard`,
    });

    return NextResponse.json({
      url: session.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create subscription session";
    return NextResponse.json({ error: message, url: null }, { status: 500 });
  }
}
