import { MARKETING_PLANS, type MarketingPlanId } from "@/lib/garmon-plan-config";

/** Rows from `public.membership_plan_catalog` (Supabase). */
export type MembershipPlanCatalogRow = {
  id: string;
  display_order: number;
  name: string;
  price_monthly_usd: number | string;
  ad_rate_per_ad: number | string;
  referral_commission_pct: number | string;
  min_withdrawal_usd: number | string;
  features: unknown;
  is_active?: boolean;
};

export function catalogFeaturesToStrings(features: unknown): string[] {
  if (Array.isArray(features)) {
    return features.map((x) => String(x).trim()).filter(Boolean);
  }
  if (features != null && typeof features === "object" && !Array.isArray(features)) {
    const o = features as { bullets?: unknown };
    if (Array.isArray(o.bullets)) {
      return o.bullets.map((x) => String(x).trim()).filter(Boolean);
    }
  }
  return [];
}

/** Embedded catalog when DB/API unavailable — matches migration seed data. */
export function getEmbeddedMembershipCatalog(): MembershipPlanCatalogRow[] {
  const order: MarketingPlanId[] = ["free", "starter", "growth", "pro", "elite"];
  const featuresById: Record<MarketingPlanId, string[]> = {
    free: [
      "Ad rate $0.01 per ad",
      "10% referral commission on all referral earnings forever",
      "$20 minimum withdrawal",
      "Basic tasks only",
    ],
    starter: [
      "Ad rate $0.03 per ad",
      "20% referral commission",
      "$10 minimum withdrawal",
      "5 extra daily tasks",
    ],
    growth: [
      "Ad rate $0.05 per ad",
      "30% referral commission",
      "$5 minimum withdrawal",
      "Games and tasks access",
      "$10 monthly advertising credit",
    ],
    pro: [
      "Ad rate $0.08 per ad",
      "40% referral commission",
      "$2 minimum withdrawal",
      "Priority tasks",
      "$25 monthly advertising credit",
    ],
    elite: [
      "Ad rate $0.15 per ad",
      "50% referral commission (maximum)",
      "$1 minimum withdrawal",
      "All access to every feature",
      "$50 monthly advertising credit",
    ],
  };
  return order.map((id, i) => {
    const m = MARKETING_PLANS[id];
    return {
      id,
      display_order: i,
      name: m.label,
      price_monthly_usd: m.monthlyUsd,
      ad_rate_per_ad: m.adRatePerAd,
      referral_commission_pct: m.referralPct,
      min_withdrawal_usd: m.minWithdrawUsd,
      features: featuresById[id],
      is_active: true,
    };
  });
}
