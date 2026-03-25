import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/membership-plans — public marketing tiers from `membership_plan_catalog`.
 */
export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable", plans: [] }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("membership_plan_catalog")
    .select(
      "id, display_order, name, price_monthly_usd, ad_rate_per_ad, referral_commission_pct, min_withdrawal_usd, features, is_active"
    )
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[api/membership-plans]", error);
    return NextResponse.json({ message: "Failed to load plans", plans: [] }, { status: 500 });
  }

  return NextResponse.json({ plans: data ?? [] });
}
