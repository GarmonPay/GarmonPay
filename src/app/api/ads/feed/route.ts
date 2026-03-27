import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  getActiveGarmonAds,
  getEngagedAdIdsToday,
} from "@/lib/garmon-ads-db";
import {
  GARMON_AD_RATES,
  baseUserEarnForVideoTier,
  baseUserEarnForBannerView,
  baseUserEarnForClick,
} from "@/lib/garmon-ad-rates";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const FEED_LIMIT = 10;
const RATE_LIMIT_PER_HOUR = 100;
const WINDOW_MS = 60 * 60 * 1000;

/** GET /api/ads/feed — active ads for current user, excluding already-engaged today. */
export async function GET(request: Request) {
  const rl = rateLimitFeed(request);
  if (rl) return rl;

  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [ads, engagedIds] = await Promise.all([
      getActiveGarmonAds(50),
      getEngagedAdIdsToday(userId),
    ]);
    const filtered = ads.filter((a) => !engagedIds.has(a.id)).slice(0, FEED_LIMIT);
    return NextResponse.json({
      ads: filtered.map((ad) => {
        const adType = ad.ad_type;
        const userEarnsView =
          adType === "banner"
            ? baseUserEarnForBannerView(ad.cost_per_view)
            : baseUserEarnForVideoTier("view_30", ad.cost_per_view);
        const userEarnsClick = baseUserEarnForClick(ad.cost_per_click);
        const userEarnsFollow = GARMON_AD_RATES.follow.userEarns;
        const userEarnsShare = GARMON_AD_RATES.share.userEarns;
        return {
          id: ad.id,
          advertiserId: ad.advertiser_id,
          advertiserName: (ad.advertisers as { business_name?: string } | null)?.business_name ?? "",
          advertiserLogo: (ad.advertisers as { logo_url?: string } | null)?.logo_url ?? null,
          title: ad.title,
          description: ad.description,
          adType: ad.ad_type,
          mediaUrl: ad.media_url,
          thumbnailUrl: ad.thumbnail_url,
          destinationUrl: ad.destination_url,
          instagramUrl: ad.instagram_url,
          tiktokUrl: ad.tiktok_url,
          youtubeUrl: ad.youtube_url,
          twitterUrl: ad.twitter_url,
          facebookUrl: ad.facebook_url,
          twitchUrl: ad.twitch_url,
          costPerView: Number(ad.cost_per_view),
          costPerClick: Number(ad.cost_per_click),
          costPerFollow: Number(ad.cost_per_follow),
          costPerShare: Number(ad.cost_per_share),
          userEarnsView,
          userEarnsClick,
          userEarnsFollow,
          userEarnsShare,
          userEarnsView15: baseUserEarnForVideoTier("view_15", ad.cost_per_view),
          userEarnsView30: baseUserEarnForVideoTier("view_30", ad.cost_per_view),
          userEarnsView60: baseUserEarnForVideoTier("view_60", ad.cost_per_view),
        };
      }),
    });
  } catch (e) {
    console.error("Ads feed error:", e);
    return NextResponse.json({ message: "Failed to load feed", ads: [] }, { status: 500 });
  }
}

function rateLimitFeed(request: Request): Response | null {
  const ip = getClientIp(request);
  const result = checkRateLimit(ip, "ads:feed", RATE_LIMIT_PER_HOUR, WINDOW_MS);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({ message: "Too Many Requests", retryAfter: result.retryAfterSec }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfterSec),
        },
      }
    );
  }
  return null;
}
