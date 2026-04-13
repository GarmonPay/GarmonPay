import type { MarketingPlanId } from "@/lib/garmon-plan-config";

/** Monthly GPay Coins (GPC) credited to members while subscribed — display on /pricing only. */
export const MEMBERSHIP_MONTHLY_GPC_BONUS: Record<MarketingPlanId, number> = {
  free: 0,
  starter: 200,
  growth: 750,
  pro: 2_000,
  elite: 5_000,
};

export function getMonthlyGpcBonusForPlan(planId: string): number {
  const id = planId as MarketingPlanId;
  return MEMBERSHIP_MONTHLY_GPC_BONUS[id] ?? 0;
}
