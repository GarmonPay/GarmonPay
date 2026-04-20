import type { MarketingPlanId } from "@/lib/garmon-plan-config";
import { MONTHLY_BONUSES, FIRST_MONTH_TOTAL_GPC } from "@/lib/membership-bonus";

/** Monthly GPay Coins (GPC) for active paid tiers — canonical values from membership-bonus. */
export const MEMBERSHIP_MONTHLY_GPC_BONUS: Record<MarketingPlanId, number> = {
  free: 0,
  starter: MONTHLY_BONUSES.starter,
  growth: MONTHLY_BONUSES.growth,
  pro: MONTHLY_BONUSES.pro,
  elite: MONTHLY_BONUSES.elite,
};

export function getMonthlyGpcBonusForPlan(planId: string): number {
  const id = planId as MarketingPlanId;
  return MEMBERSHIP_MONTHLY_GPC_BONUS[id] ?? MONTHLY_BONUSES[planId as keyof typeof MONTHLY_BONUSES] ?? 0;
}

export function getFirstMonthTotalGpcForPlan(planId: string): number {
  const t = planId.toLowerCase();
  if (t in FIRST_MONTH_TOTAL_GPC) return FIRST_MONTH_TOTAL_GPC[t as keyof typeof FIRST_MONTH_TOTAL_GPC];
  return 0;
}
