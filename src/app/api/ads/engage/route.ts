import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  getGarmonAdById,
  hasUserFraudFlag,
  isUserBannedFromAds,
  isIpBlocked,
  getEngagementsSameAdLast24h,
  getEngagementsSameAdvertiserToday,
  getUserAdEarningsTodayDollars,
  updateAdStreak,
} from "@/lib/garmon-ads-db";
import { checkIpReputation } from "@/lib/ip-reputation";
import { createGarmonNotification } from "@/lib/garmon-notifications";
import { grantAdReferralCommission } from "@/lib/viral-referral-db";
import {
  GARMON_AD_RATES,
  baseUserEarnForVideoTier,
  baseUserEarnForBannerView,
  baseUserEarnForClick,
  capAdEarnMultiplier,
  GARMON_AD_EARN_MULT_CAP,
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
  sessionId?: string;
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

  const { adId, engagementType, durationSeconds = 0, sessionId } = body;
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
    if (await isUserBannedFromAds(userId)) {
      return NextResponse.json({ message: "Account cannot earn from ads" }, { status: 403 });
    }

    const ip = getClientIp(request);
    if (await isIpBlocked(ip)) {
      return NextResponse.json({ message: "Access denied" }, { status: 403 });
    }
    const deviceType = request.headers.get("user-agent") ?? null;
    const ipFraud = await validateIpFraud(supabase, userId, ip);
    if (!ipFraud.ok) {
      return NextResponse.json({ message: ipFraud.message }, { status: 403 });
    }
    const timingFraud = await validateBotTiming(supabase, userId, adId);
    if (!timingFraud.ok) {
      return NextResponse.json({ message: timingFraud.message }, { status: 403 });
    }
    const vpnCheck = await checkIpReputation(ip);
    if (vpnCheck.suspicious) {
      await supabase.from("garmon_ad_fraud_flags").insert({
        user_id: userId,
        reason: `Suspicious IP (proxy=${vpnCheck.proxy ?? false}, hosting=${vpnCheck.hosting ?? false})`,
      });
      return NextResponse.json(
        { message: "Suspicious IP (VPN/proxy). Contact support if this is a mistake." },
        { status: 403 }
      );
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

    let userEarns: number;

    let serverDuration = Math.round(durationSeconds ?? 0);
    if (sessionId) {
      const sessionValidation = await validateAndConsumeSession(
        supabase,
        sessionId,
        userId,
        adId,
        engagementType
      );
      if (!sessionValidation.ok) {
        return NextResponse.json({ message: sessionValidation.message }, { status: 400 });
      }
      serverDuration = sessionValidation.elapsedSeconds;
    }

    if (engagementType === "view") {
      const dur = serverDuration;
      let tier: "view_15" | "view_30" | "view_60";
      if (dur >= VIDEO_MIN_SECONDS.view_60) {
        tier = "view_60";
      } else if (dur >= VIDEO_MIN_SECONDS.view_30) {
        tier = "view_30";
      } else if (dur >= VIDEO_MIN_SECONDS.view_15) {
        tier = "view_15";
      } else {
        return NextResponse.json(
          { message: "Watch at least 15 seconds for video credit" },
          { status: 400 }
        );
      }
      userEarns = baseUserEarnForVideoTier(tier, ad.cost_per_view);
    } else if (engagementType === "banner_view") {
      if (serverDuration < BANNER_VIEW_SECONDS) {
        return NextResponse.json(
          { message: "View banner for at least 30 seconds" },
          { status: 400 }
        );
      }
      userEarns = baseUserEarnForBannerView(ad.cost_per_view);
    } else if (engagementType === "click") {
      userEarns = baseUserEarnForClick(ad.cost_per_click);
    } else if (engagementType === "follow") {
      userEarns = GARMON_AD_RATES.follow.userEarns;
    } else {
      userEarns = GARMON_AD_RATES.share.userEarns;
    }

    let earnMult = 1;
    if (GARMON_AD_EARN_MULT_CAP > 1) {
      const levelMultiplier = await getLevelMultiplier(supabase, userId);
      const streakMultiplier = await getStreakMultiplier(supabase, userId);
      earnMult = capAdEarnMultiplier(levelMultiplier, streakMultiplier);
    }
    userEarns = round6(userEarns * earnMult);
    const advertiserCharged = round6(userEarns * 2);
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

    const { data, error } = await supabase.rpc("garmon_ad_engage", {
      p_user_id: userId,
      p_ad_id: adId,
      p_engagement_type: engagementType,
      p_duration_seconds: serverDuration,
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

async function validateIpFraud(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  ip: string
): Promise<{ ok: boolean; message?: string }> {
  if (!ip || ip === "unknown") return { ok: true };
  const { data } = await supabase
    .from("garmon_ad_engagements")
    .select("user_id")
    .eq("ip_address", ip)
    .limit(300);
  const users = new Set<string>((data ?? []).map((r: { user_id: string }) => r.user_id));
  users.add(userId);
  if (users.size > 3) {
    await supabase.from("garmon_ad_fraud_flags").insert({
      user_id: userId,
      reason: "IP linked to more than 3 ad-earning accounts",
    });
    return { ok: false, message: "Suspicious IP activity detected" };
  }
  return { ok: true };
}

async function validateBotTiming(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  adId: string
): Promise<{ ok: boolean; message?: string }> {
  const { data } = await supabase
    .from("garmon_ad_engagements")
    .select("created_at, ad_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { created_at?: string; ad_id?: string } | null;
  if (!row?.created_at) return { ok: true };
  const ms = Date.now() - new Date(row.created_at).getTime();
  if (ms < 2000) {
    await supabase.from("garmon_ad_fraud_flags").insert({
      user_id: userId,
      ad_id: adId,
      reason: "Engagement submitted too quickly (<2s)",
    });
    return { ok: false, message: "Engagement rejected (timing validation failed)" };
  }
  return { ok: true };
}

async function validateAndConsumeSession(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  sessionId: string,
  userId: string,
  adId: string,
  engagementType: string
): Promise<{ ok: boolean; message?: string; elapsedSeconds: number }> {
  const { data, error } = await supabase
    .from("garmon_engagement_sessions")
    .select("id, started_at, expires_at, consumed_at, user_id, ad_id, engagement_type")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data) return { ok: false, message: "Invalid engagement session", elapsedSeconds: 0 };
  const row = data as {
    id: string;
    started_at: string;
    expires_at: string;
    consumed_at: string | null;
    user_id: string;
    ad_id: string;
    engagement_type: string;
  };
  if (row.user_id !== userId || row.ad_id !== adId || row.engagement_type !== engagementType) {
    return { ok: false, message: "Session does not match engagement", elapsedSeconds: 0 };
  }
  if (row.consumed_at) return { ok: false, message: "Session already used", elapsedSeconds: 0 };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, message: "Session expired, start again", elapsedSeconds: 0 };
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(row.started_at).getTime()) / 1000));
  const minSeconds =
    engagementType === "follow"
      ? 5
      : engagementType === "banner_view"
        ? 30
        : engagementType === "click"
          ? 2
          : 0;
  if (elapsedSeconds < minSeconds) {
    return { ok: false, message: "Engagement duration too short", elapsedSeconds };
  }
  await supabase
    .from("garmon_engagement_sessions")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("consumed_at", null);
  return { ok: true, elapsedSeconds };
}
