/** Marketing membership tiers — shared across landing, pricing, referral, dashboard. */

export type MarketingPlanId = "free" | "starter" | "growth" | "pro" | "elite";

/** UI / upgrade flow order (Free always first; paid tiers follow). */
export const ALL_MEMBERSHIP_PLANS_ORDER: readonly MarketingPlanId[] = [
  "free",
  "starter",
  "growth",
  "pro",
  "elite",
] as const;

export function membershipTierRank(tier: MarketingPlanId): number {
  const i = ALL_MEMBERSHIP_PLANS_ORDER.indexOf(tier);
  return i >= 0 ? i : 0;
}

/**
 * Map `users.membership` (and legacy values) to a marketing tier.
 * Empty / unknown → free (unpaid members are never implied to be Starter).
 */
export function normalizeUserMembershipTier(raw: string | null | undefined): MarketingPlanId {
  const t = (raw ?? "").toLowerCase().trim();
  if (!t) return "free";
  if (t === "vip") return "elite";
  if ((ALL_MEMBERSHIP_PLANS_ORDER as readonly string[]).includes(t)) return t as MarketingPlanId;
  /** Legacy Stripe “subscribed but tier not synced” flag — treat as Free for display until tier is written. */
  if (t === "active") return "free";
  return "free";
}

export const MARKETING_PLANS: Record<
  MarketingPlanId,
  {
    label: string;
    monthlyUsd: number;
    adRatePerAd: number;
    referralPct: number;
    minWithdrawUsd: number;
  }
> = {
  free: {
    label: "Free",
    monthlyUsd: 0,
    adRatePerAd: 0.01,
    referralPct: 10,
    minWithdrawUsd: 20,
  },
  starter: {
    label: "Starter",
    monthlyUsd: 9.99,
    adRatePerAd: 0.03,
    referralPct: 20,
    minWithdrawUsd: 10,
  },
  growth: {
    label: "Growth",
    monthlyUsd: 24.99,
    adRatePerAd: 0.05,
    referralPct: 30,
    minWithdrawUsd: 5,
  },
  pro: {
    label: "Pro",
    monthlyUsd: 49.99,
    adRatePerAd: 0.08,
    referralPct: 40,
    minWithdrawUsd: 2,
  },
  elite: {
    label: "Elite",
    monthlyUsd: 99.99,
    adRatePerAd: 0.15,
    referralPct: 50,
    minWithdrawUsd: 1,
  },
};

/**
 * Map API / DB `membershipTier` / `membership` string to marketing referral commission %.
 * DB values: starter, pro, elite, vip, active — aligned to marketing Free→Elite.
 */
export function referralCommissionFromMembershipTier(tier: string | undefined | null): number {
  const t = (tier ?? "").toLowerCase().trim();
  if (t === "vip" || t === "elite") return MARKETING_PLANS.elite.referralPct;
  if (t === "pro") return MARKETING_PLANS.pro.referralPct;
  if (t === "growth") return MARKETING_PLANS.growth.referralPct;
  if (t === "free") return MARKETING_PLANS.free.referralPct;
  if (t === "starter") return MARKETING_PLANS.starter.referralPct;
  if (t === "active") return MARKETING_PLANS.starter.referralPct;
  return MARKETING_PLANS.free.referralPct;
}
