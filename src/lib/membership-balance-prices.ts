import type { MarketingPlanId } from "@/lib/garmon-plan-config";

export type PaidMembershipTierId = Exclude<MarketingPlanId, "free">;

/** Product USD prices for membership tiers. */
export const PAID_TIER_PRICES_USD: Record<PaidMembershipTierId, number> = {
  starter: 9.99,
  growth: 24.99,
  pro: 49.99,
  elite: 99.99,
};

/**
 * Pay-with-balance charges in whole GC.
 * Rounded UP from USD prices (e.g. $9.99 => 10 GC) for clean integer math.
 */
export const PAID_TIER_PRICES_GC: Record<PaidMembershipTierId, number> = {
  starter: 10,
  growth: 25,
  pro: 50,
  elite: 100,
};

export function isPaidTierId(id: string): id is PaidMembershipTierId {
  return id === "starter" || id === "growth" || id === "pro" || id === "elite";
}
