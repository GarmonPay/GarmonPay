/**
 * Profit protection source-of-truth.
 * All payout guardrails and baseline financial assumptions live here.
 */

export type MemberPlan = "free" | "starter" | "growth" | "pro" | "elite";
export type UpgradePlan = "starter" | "growth" | "pro" | "elite";

export const AD_PACKAGES = {
  basic_reach: {
    name: "Basic Reach",
    advertiserCostUsd: 19.99,
    views: 500,
    memberPayoutPoolUsd: 5.0,
    platformProfitUsd: 14.99,
  },
  standard_reach: {
    name: "Standard Reach",
    advertiserCostUsd: 49.99,
    views: 1500,
    memberPayoutPoolUsd: 15.0,
    platformProfitUsd: 34.99,
  },
  growth_reach: {
    name: "Growth Reach",
    advertiserCostUsd: 99.99,
    views: 3500,
    memberPayoutPoolUsd: 35.0,
    platformProfitUsd: 64.99,
  },
  pro_reach: {
    name: "Pro Reach",
    advertiserCostUsd: 199.99,
    views: 8000,
    memberPayoutPoolUsd: 80.0,
    platformProfitUsd: 119.99,
  },
  elite_reach: {
    name: "Elite Reach",
    advertiserCostUsd: 399.99,
    views: 18000,
    memberPayoutPoolUsd: 180.0,
    platformProfitUsd: 219.99,
  },
  premium_brand: {
    name: "Premium Brand",
    advertiserCostUsd: 799.99,
    views: 40000,
    memberPayoutPoolUsd: 400.0,
    platformProfitUsd: 399.99,
  },
} as const;

export const MEMBER_EARN_RATES: Record<
  MemberPlan,
  { adViewUsd: number; taskUsd: number; gameUsd: number }
> = {
  free: { adViewUsd: 0.01, taskUsd: 0.25, gameUsd: 0.5 },
  starter: { adViewUsd: 0.03, taskUsd: 0.5, gameUsd: 0.75 },
  growth: { adViewUsd: 0.05, taskUsd: 0.75, gameUsd: 1.0 },
  pro: { adViewUsd: 0.08, taskUsd: 1.0, gameUsd: 1.5 },
  elite: { adViewUsd: 0.15, taskUsd: 1.5, gameUsd: 2.0 },
};

export const REFERRAL_COMMISSIONS: Record<MemberPlan, Record<UpgradePlan, number>> = {
  free: { starter: 3, growth: 8, pro: 15, elite: 25 },
  starter: { starter: 4, growth: 10, pro: 18, elite: 30 },
  growth: { starter: 5, growth: 12, pro: 22, elite: 35 },
  pro: { starter: 6, growth: 15, pro: 27, elite: 42 },
  elite: { starter: 8, growth: 20, pro: 35, elite: 50 },
};

/** Keep at least 60% of advertiser revenue as platform profit. */
export const PROFIT_SAFETY_THRESHOLD = 0.6;

export const DAILY_PAYOUT_CAPS = {
  // Increase this as advertiser revenue and payout liquidity scale.
  totalMemberPayoutCents: 50_000, // $500/day
} as const;

/**
 * Given total advertiser revenue (in cents), compute max payout pool (in cents)
 * while preserving PROFIT_SAFETY_THRESHOLD.
 */
export function calculateAvailablePayoutPool(totalAdvertiserRevenueCents: number): number {
  const revenueCents = Math.max(0, Math.floor(totalAdvertiserRevenueCents));
  const payoutShare = 1 - PROFIT_SAFETY_THRESHOLD;
  return Math.floor(revenueCents * payoutShare);
}

/**
 * Returns true if adding `amountCents` keeps payouts within the daily cap.
 */
export function isSafeToCredit(amountCents: number, currentDailyPayoutTotalCents: number): boolean {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return false;
  if (!Number.isFinite(currentDailyPayoutTotalCents) || currentDailyPayoutTotalCents < 0) return false;
  return currentDailyPayoutTotalCents + amountCents <= DAILY_PAYOUT_CAPS.totalMemberPayoutCents;
}
