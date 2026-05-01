/**
 * GarmonPay ad earnings rates. Advertisers charged 2x user earnings; GarmonPay keeps 50%.
 * All amounts in dollars (convert to cents for wallet).
 *
 * Server-side member payout helpers (async, DB-backed): {@link ./garmon-member-payout}.
 */

export type GarmonEngagementType =
  | "view_15"
  | "view_30"
  | "view_60"
  | "click"
  | "follow"
  | "share"
  | "banner_view";

/** Used when `garmon_ads.cost_per_view` is below `GARMON_LEGACY_COST_PER_VIEW_MAX` (older rows). */
export const GARMON_AD_RATES: Record<
  GarmonEngagementType,
  { userEarns: number; advertiserCharged: number }
> = {
  view_15: { userEarns: 0.005, advertiserCharged: 0.01 },
  view_30: { userEarns: 0.01, advertiserCharged: 0.02 },
  view_60: { userEarns: 0.015, advertiserCharged: 0.03 },
  click: { userEarns: 0.05, advertiserCharged: 0.1 },
  follow: { userEarns: 0.05, advertiserCharged: 0.1 },
  share: { userEarns: 0.03, advertiserCharged: 0.06 },
  banner_view: { userEarns: 0.01, advertiserCharged: 0.02 },
};

/** Default advertiser charge per 30s-class view; member gets half before streak/level multipliers. */
export const GARMON_DEFAULT_ADVERTISER_COST_PER_VIEW = 0.02;

/** Default advertiser charge per click. */
export const GARMON_DEFAULT_ADVERTISER_COST_PER_CLICK = 0.1;

/** Below this `cost_per_view`, use `GARMON_AD_RATES` for video/banner tiers (legacy campaigns). */
export const GARMON_LEGACY_COST_PER_VIEW_MAX = 0.015;

/** Below this `cost_per_click`, use legacy click rate from `GARMON_AD_RATES`. */
export const GARMON_LEGACY_COST_PER_CLICK_MAX = 0.08;

/**
 * Max combined level × streak multiplier on ad member payouts (and thus on advertiser charge = 2× payout).
 * Use `1` so real spend matches `advertiser_burn_ceiling_usd` on ad packages. Raise only if SKUs reserve extra headroom.
 */
export const GARMON_AD_EARN_MULT_CAP = 1;

export function capAdEarnMultiplier(levelMult: number, streakMult: number): number {
  const raw = (Number.isFinite(levelMult) ? levelMult : 1) * (Number.isFinite(streakMult) ? streakMult : 1);
  return Math.min(Math.max(raw, 0), GARMON_AD_EARN_MULT_CAP);
}

/** Map engagement_type from DB to rate key. */
export const ENGAGEMENT_TO_RATE: Record<string, GarmonEngagementType> = {
  view: "view_30", // default view = 30 sec
  click: "click",
  follow: "follow",
  share: "share",
  banner_view: "banner_view",
};

/** Max user earnings per day from ads (dollars). */
export const MAX_USER_EARNINGS_PER_DAY = 2.0;

/** Max engagements per user per ad per 24 hours. */
export const MAX_ENGAGEMENTS_SAME_AD_PER_DAY = 1;

/** Max engagements per user per advertiser per day. */
export const MAX_ENGAGEMENTS_SAME_ADVERTISER_PER_DAY = 3;

/** Min video watch seconds for view_15 / view_30 / view_60. */
export const VIDEO_MIN_SECONDS = { view_15: 15, view_30: 30, view_60: 60 };

/** Banner view duration seconds. */
export const BANNER_VIEW_SECONDS = 30;
