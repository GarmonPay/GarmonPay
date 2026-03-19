import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getGarmonAdById } from "@/lib/garmon-ads-db";

/**
 * POST /api/ads/deposit — Advertiser deposits budget for an ad via Stripe.
 * Body: { adId, amount } or Stripe session id after payment.
 * For now: expect amount in dollars; we add to ad remaining_budget and activate if status was pending and amount >= 5.
 * Stripe integration: webhook will call this or a dedicated credit function.
 */
export async function POST(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { adId: string; amount: number; stripePaymentIntentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { adId, amount } = body;
  if (!adId || amount == null || amount < 5) {
    return NextResponse.json(
      { message: "adId and amount (min $5) required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  try {
    const ad = await getGarmonAdById(adId);
    if (!ad) {
      return NextResponse.json({ message: "Ad not found" }, { status: 404 });
    }
    if (ad.user_id !== userId) {
      return NextResponse.json({ message: "Not your ad" }, { status: 403 });
    }

    const newRemaining = Number(ad.remaining_budget) + Number(amount);
    const newTotal = Number(ad.total_budget) + Number(amount);
    const updates: {
      remaining_budget: number;
      total_budget: number;
      status?: string;
      is_active?: boolean;
      updated_at: string;
    } = {
      remaining_budget: newRemaining,
      total_budget: newTotal,
      updated_at: new Date().toISOString(),
    };
    if (ad.status === "pending" && newRemaining >= 5) {
      updates.status = "active";
      updates.is_active = true;
    }

    const { error } = await supabase
      .from("garmon_ads")
      .update(updates)
      .eq("id", adId);
    if (error) throw error;

    return NextResponse.json({
      success: true,
      adId,
      remainingBudget: newRemaining,
      totalBudget: newTotal,
      status: updates.status ?? ad.status,
    });
  } catch (e) {
    console.error("Ads deposit error:", e);
    return NextResponse.json({ message: "Deposit failed" }, { status: 500 });
  }
}
