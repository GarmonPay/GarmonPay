/**
 * Server-only member payout floors from platform_settings (via rates.ts).
 * Import only from API routes / server code — not from client bundles.
 */

import {
  GARMON_LEGACY_COST_PER_CLICK_MAX,
  GARMON_LEGACY_COST_PER_VIEW_MAX,
} from "@/lib/garmon-ad-rates";
import { getClickPayoutCents, getViewPayoutCents } from "@/lib/rates";

/**
 * Base member payout ($) before level/streak multipliers.
 * Legacy (low advertiser cost): single admin view rate for all video tiers (v1).
 * Above threshold: tiered fraction of advertiser half (unchanged).
 */
export async function baseUserEarnForVideoTier(
  tier: "view_15" | "view_30" | "view_60",
  adCostPerView: number
): Promise<number> {
  const adv = Number(adCostPerView);
  if (!Number.isFinite(adv) || adv <= GARMON_LEGACY_COST_PER_VIEW_MAX) {
    return (await getViewPayoutCents()) / 100;
  }
  const u30 = adv / 2;
  if (tier === "view_15") return u30 * 0.5;
  if (tier === "view_30") return u30;
  return u30 * 1.5;
}

export async function baseUserEarnForBannerView(adCostPerView: number): Promise<number> {
  const adv = Number(adCostPerView);
  if (!Number.isFinite(adv) || adv <= GARMON_LEGACY_COST_PER_VIEW_MAX) {
    return (await getViewPayoutCents()) / 100;
  }
  return adv / 2;
}

export async function baseUserEarnForClick(adCostPerClick: number): Promise<number> {
  const adv = Number(adCostPerClick);
  if (!Number.isFinite(adv) || adv <= GARMON_LEGACY_COST_PER_CLICK_MAX) {
    return (await getClickPayoutCents()) / 100;
  }
  return adv / 2;
}
