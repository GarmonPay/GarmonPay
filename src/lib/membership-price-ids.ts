import type { MarketingPlanId } from "@/lib/garmon-plan-config";

export type PaidMembershipTier = Exclude<MarketingPlanId, "free">;

export const MEMBERSHIP_PRICE_ENV_BY_TIER: Record<PaidMembershipTier, string> = {
  starter: "STRIPE_PRICE_STARTER_MONTHLY",
  growth: "STRIPE_PRICE_GROWTH_MONTHLY",
  pro: "STRIPE_PRICE_PRO_MONTHLY",
  elite: "STRIPE_PRICE_ELITE_MONTHLY",
};

export function getMembershipPriceId(tier: PaidMembershipTier): string | null {
  const key = MEMBERSHIP_PRICE_ENV_BY_TIER[tier];
  const value = process.env[key]?.trim();
  if (!value) return null;
  return value;
}

export function isPlaceholderPriceId(priceId: string | null | undefined): boolean {
  const v = (priceId ?? "").trim();
  if (!v) return true;
  if (!v.startsWith("price_")) return true;
  if (/^price_(xxxx|test|replace|your|placeholder)/i.test(v)) return true;
  return false;
}
