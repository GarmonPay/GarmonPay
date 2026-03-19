import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  getGarmonAdById,
  hasUserFraudFlag,
  getEngagementsSameAdLast24h,
  getEngagementsSameAdvertiserToday,
  getUserAdEarningsTodayDollars,
  updateAdStreak,
} from "@/lib/garmon-ads-db";
import { createGarmonNotification } from "@/lib/garmon-notifications";
import { grantAdReferralCommission } from "@/lib/viral-referral-db";
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
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const rl = rateLimitEngage(request, userId);
  if (rl) return rl;

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

    const levelMultiplier = await getLevelMultiplier(supabase, userId);
    const streakMultiplier = await getStreakMultiplier(supabase, userId);
    userEarns = round6(userEarns * levelMultiplier * streakMultiplier);
    advertiserCharged = round6(userEarns * 2);
    const adminEarns = userEarns;
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

    const userEarnedDollars = result.userEarnedDollars ?? userEarns;
    const userEarnedCents = result.userEarnedCents ?? Math.round(userEarns * 100);
    grantAdReferralCommission(userId, userEarnedCents, `${adId}_${Date.now()}`).catch(() => {});
    createGarmonNotification(
      userId,
      "ad_earned",
      `+$${userEarnedDollars.toFixed(3)} earned! 💰`,
      `You earned from an ad engagement.`
    ).catch(() => {});
    updateAdStreak(userId).catch(() => {});
    const { data: adAfter } = await supabase
      .from("garmon_ads")
      .select("remaining_budget, user_id")
      .eq("id", adId)
      .maybeSingle();
    const remaining = Number((adAfter as { remaining_budget?: number } | null)?.remaining_budget ?? 0);
    const advertiserUserId = (adAfter as { user_id?: string } | null)?.user_id;
    if (advertiserUserId && remaining <= 0) {
      createGarmonNotification(
        advertiserUserId,
        "ad_budget_out",
        "Your ad budget has run out",
        "Add funds to continue running your ad."
      ).catch(() => {});
    } else if (advertiserUserId && remaining > 0 && remaining <= 10) {
      createGarmonNotification(
        advertiserUserId,
        "ad_budget_low",
        "Your ad budget is running low",
        `$${remaining.toFixed(2)} remaining.`
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      userEarnedDollars,
      userEarnedCents,
    });
  } catch (e) {
    console.error("Ads engage error:", e);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

async function getLevelMultiplier(supabase: NonNullable<ReturnType<typeof createAdminClient>>, userId: string): Promise<number> {
  const { data } = await supabase
    .from("garmon_user_ad_earnings")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "credited");
  const total = (data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
  if (total >= 500) return 1.2;
  if (total >= 200) return 1.15;
  if (total >= 50) return 1.1;
  if (total >= 10) return 1.05;
  return 1.0;
}

async function getStreakMultiplier(supabase: NonNullable<ReturnType<typeof createAdminClient>>, userId: string): Promise<number> {
  const { data } = await supabase
    .from("garmon_ad_streak")
    .select("last_activity_date, streak_days")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { last_activity_date?: string; streak_days?: number } | null;
  if (!row?.streak_days) return 1.0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const last = row.last_activity_date?.slice(0, 10);
  const projected = last === today ? row.streak_days : last === yesterday ? row.streak_days + 1 : 1;
  if (projected >= 30) return 3.0;
  if (projected >= 7) return 2.0;
  return 1.0;
}

function rateLimitEngage(request: Request, userId: string | null): Response | null {
  const ip = getClientIp(request);
  const ipResult = checkRateLimit(ip, "ads:engage:ip", RATE_LIMIT_PER_HOUR, WINDOW_MS);
  if (!ipResult.allowed) {
    return new Response(
      JSON.stringify({ message: "Too Many Requests", retryAfter: ipResult.retryAfterSec }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(ipResult.retryAfterSec) } }
    );
  }
  if (userId) {
    const userResult = checkRateLimit(userId, "ads:engage:user", RATE_LIMIT_PER_HOUR, WINDOW_MS);
    if (!userResult.allowed) {
      return new Response(
        JSON.stringify({ message: "Too many engagements. Try again later.", retryAfter: userResult.retryAfterSec }),
        { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(userResult.retryAfterSec) } }
      );
    }
  }
  return null;
}
