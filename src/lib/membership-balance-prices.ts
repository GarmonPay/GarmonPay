import type { MarketingPlanId } from "@/lib/garmon-plan-config";

export type PaidMembershipTierId = Exclude<MarketingPlanId, "free">;

/** Monthly tier prices in USD cents (matches product spec). */
export const PAID_TIER_PRICES_CENTS: Record<PaidMembershipTierId, number> = {
  starter: 999,
  growth: 2499,
  pro: 4999,
  elite: 9999,
};

export function isPaidTierId(id: string): id is PaidMembershipTierId {
  return id === "starter" || id === "growth" || id === "pro" || id === "elite";
}
