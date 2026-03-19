import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  getGarmonAdById,
  hasUserFraudFlag,
  getEngagementsSameAdLast24h,
  getEngagementsSameAdvertiserToday,
  getUserAdEarningsTodayDollars,
} from "@/lib/garmon-ads-db";
import {
  GARMON_AD_RATES,
  MAX_USER_EARNINGS_PER_DAY,
  MAX_ENGAGEMENTS_SAME_AD_PER_DAY,
  MAX_ENGAGEMENTS_SAME_ADVERTISER_PER_DAY,
  VIDEO_MIN_SECONDS,
  BANNER_VIEW_SECONDS,
} from "@/lib/garmon-ad-rates";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const RATE_LIMIT_PER_HOUR = 30;
const WINDOW_MS = 60 * 60 * 1000;

type EngageBody = {
  adId: string;
  engagementType: "view" | "click" | "follow" | "share" | "banner_view";
  durationSeconds?: number;
};

/** POST /api/ads/engage — record engagement, credit user, deduct ad budget. */
export async function POST(request: Request) {
  const rl = rateLimitEngage(request);
  if (rl) return rl;

  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: EngageBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { adId, engagementType, durationSeconds = 0 } = body;
  if (!adId || !engagementType) {
    return NextResponse.json(
      { message: "adId and engagementType required" },
      { status: 400 }
    );
  }

  const validTypes = ["view", "click", "follow", "share", "banner_view"];
  if (!validTypes.includes(engagementType)) {
    return NextResponse.json({ message: "Invalid engagementType" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  try {
    const ad = await getGarmonAdById(adId);
    if (!ad) {
      return NextResponse.json({ message: "Ad not found" }, { status: 404 });
    }
    if (ad.status !== "active" || !ad.is_active) {
      return NextResponse.json({ message: "Ad is not active" }, { status: 400 });
    }

    if (await hasUserFraudFlag(userId)) {
      return NextResponse.json({ message: "Account flagged" }, { status: 403 });
    }

    const sameAd24h = await getEngagementsSameAdLast24h(userId, adId);
    if (sameAd24h >= MAX_ENGAGEMENTS_SAME_AD_PER_DAY) {
      return NextResponse.json(
        { message: "Already earned from this ad in the last 24 hours" },
        { status: 400 }
      );
    }

    const sameAdvertiserToday = await getEngagementsSameAdvertiserToday(userId, ad.advertiser_id);
    if (sameAdvertiserToday >= MAX_ENGAGEMENTS_SAME_ADVERTISER_PER_DAY) {
      return NextResponse.json(
        { message: "Max 3 engagements per advertiser per day" },
        { status: 400 }
      );
    }

    const earnedToday = await getUserAdEarningsTodayDollars(userId);
    if (earnedToday >= MAX_USER_EARNINGS_PER_DAY) {
      return NextResponse.json(
        { message: "Daily earnings limit ($2) reached" },
        { status: 400 }
      );
    }

    let rateKey: keyof typeof GARMON_AD_RATES;
    let advertiserCharged: number;
    let userEarns: number;

    if (engagementType === "view") {
      const dur = durationSeconds ?? 0;
      if (dur >= VIDEO_MIN_SECONDS.view_60) {
        rateKey = "view_60";
      } else if (dur >= VIDEO_MIN_SECONDS.view_30) {
        rateKey = "view_30";
      } else if (dur >= VIDEO_MIN_SECONDS.view_15) {
        rateKey = "view_15";
      } else {
        return NextResponse.json(
          { message: "Watch at least 15 seconds for video credit" },
          { status: 400 }
        );
      }
      const rate = GARMON_AD_RATES[rateKey];
      advertiserCharged = rate.advertiserCharged;
      userEarns = rate.userEarns;
    } else if (engagementType === "banner_view") {
      if ((durationSeconds ?? 0) < BANNER_VIEW_SECONDS) {
        return NextResponse.json(
          { message: "View banner for at least 30 seconds" },
          { status: 400 }
        );
      }
      const rate = GARMON_AD_RATES.banner_view;
      advertiserCharged = rate.advertiserCharged;
      userEarns = rate.userEarns;
    } else if (engagementType === "click") {
      const rate = GARMON_AD_RATES.click;
      advertiserCharged = rate.advertiserCharged;
      userEarns = rate.userEarns;
    } else if (engagementType === "follow") {
      const rate = GARMON_AD_RATES.follow;
      advertiserCharged = rate.advertiserCharged;
      userEarns = rate.userEarns;
    } else {
      const rate = GARMON_AD_RATES.share;
      advertiserCharged = rate.advertiserCharged;
      userEarns = rate.userEarns;
    }

    const adminEarns = advertiserCharged - userEarns;
    if (Number(ad.remaining_budget) < advertiserCharged) {
      return NextResponse.json({ message: "Ad budget exhausted" }, { status: 400 });
    }

    if (earnedToday + userEarns > MAX_USER_EARNINGS_PER_DAY) {
      return NextResponse.json(
        { message: "This would exceed your daily $2 limit" },
        { status: 400 }
      );
    }

    const ip = getClientIp(request);
    const deviceType = request.headers.get("user-agent") ?? null;

    const { data, error } = await supabase.rpc("garmon_ad_engage", {
      p_user_id: userId,
      p_ad_id: adId,
      p_engagement_type: engagementType,
      p_duration_seconds: Math.round(durationSeconds ?? 0),
      p_user_earned_dollars: userEarns,
      p_admin_earned_dollars: adminEarns,
      p_advertiser_charged_dollars: advertiserCharged,
      p_ip_address: ip,
      p_device_type: deviceType,
    });

    if (error) {
      console.error("garmon_ad_engage error:", error);
      return NextResponse.json(
        { message: error.message ?? "Engagement failed" },
        { status: 500 }
      );
    }

    const result = data as {
      success?: boolean;
      message?: string;
      userEarnedDollars?: number;
      userEarnedCents?: number;
    };
    if (!result?.success) {
      return NextResponse.json(
        { message: result?.message ?? "Engagement failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      userEarnedDollars: result.userEarnedDollars ?? userEarns,
      userEarnedCents: result.userEarnedCents ?? Math.round(userEarns * 100),
    });
  } catch (e) {
    console.error("Ads engage error:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

function rateLimitEngage(request: Request): Response | null {
  const ip = getClientIp(request);
  const result = checkRateLimit(ip, "ads:engage", RATE_LIMIT_PER_HOUR, WINDOW_MS);
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
