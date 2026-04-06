/** Order for GarmonPay membership vs social task `min_tier`. */
const TIER_ORDER = ["free", "starter", "growth", "pro", "elite"] as const;

export function tierRank(tier: string | null | undefined): number {
  const t = (tier ?? "free").toLowerCase();
  const i = (TIER_ORDER as readonly string[]).indexOf(t);
  return i >= 0 ? i : 0;
}

export function userMeetsMinTier(userMembership: string | null | undefined, minTier: string): boolean {
  return tierRank(userMembership) >= tierRank(minTier);
}

export function isEliteOrHigher(membership: string | null | undefined): boolean {
  return tierRank(membership) >= tierRank("elite");
}
