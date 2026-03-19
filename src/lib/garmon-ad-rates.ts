/**
 * GarmonPay ad earnings rates. Advertisers charged 2x user earnings; GarmonPay keeps 50%.
 * All amounts in dollars (convert to cents for wallet).
 */

export type GarmonEngagementType =
  | "view_15"
  | "view_30"
  | "view_60"
  | "click"
  | "follow"
  | "share"
  | "banner_view";

export const GARMON_AD_RATES: Record<
  GarmonEngagementType,
  { userEarns: number; advertiserCharged: number }
> = {
  view_15: { userEarns: 0.005, advertiserCharged: 0.01 },
  view_30: { userEarns: 0.008, advertiserCharged: 0.016 },
  view_60: { userEarns: 0.012, advertiserCharged: 0.024 },
  click: { userEarns: 0.025, advertiserCharged: 0.05 },
  follow: { userEarns: 0.05, advertiserCharged: 0.1 },
  share: { userEarns: 0.03, advertiserCharged: 0.06 },
  banner_view: { userEarns: 0.002, advertiserCharged: 0.004 },
};

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
