/**
 * Watch-only GPC earn: server-timed sessions, creditGpayIdempotent payouts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";
import { creditGpayIdempotent } from "@/lib/coins";
import { platformSettingsRowId } from "@/lib/platform-settings-db";

export const WATCH_SECONDS_REQUIRED = 30;
export const SESSION_MAX_AGE_MS = 15 * 60 * 1000;

export const DAILY_GPC_CAP_BY_TIER: Record<string, number> = {
  free: 50,
  starter: 150,
  growth: 400,
  pro: 1000,
  elite: 2500,
  vip: 2500,
};

export type CreatorVideoRow = {
  id: string;
  creator_id: string;
  title: string;
  video_url: string;
  thumbnail_url: string | null;
  target_demo: TargetDemo | null;
  budget_gpc: number;
  spent_gpc: number;
  views_count: number;
  status: string;
  created_at: string;
};

export type TargetDemo = {
  age_min?: number | null;
  age_max?: number | null;
  gender?: string | null;
  interests?: string[] | null;
};

function supabase(): SupabaseClient {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export function normalizeMembershipTier(raw: string | null | undefined): string {
  const t = (raw ?? "free").trim().toLowerCase();
  if (t in DAILY_GPC_CAP_BY_TIER) return t;
  if (t === "member") return "free";
  return "free";
}

export function dailyCapForTier(tier: string): number {
  return DAILY_GPC_CAP_BY_TIER[normalizeMembershipTier(tier)] ?? DAILY_GPC_CAP_BY_TIER.free;
}

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getWatchPayoutGpc(): Promise<number> {
  const { data } = await supabase()
    .from("platform_settings")
    .select("watch_payout_gpc")
    .limit(1)
    .maybeSingle();
  const n = Number((data as { watch_payout_gpc?: number } | null)?.watch_payout_gpc ?? 10);
  return Math.max(1, Math.floor(n));
}

export async function setWatchPayoutGpc(gpc: number): Promise<{ ok: boolean; message?: string }> {
  const sb = supabase();
  const rowId = await platformSettingsRowId(sb);
  if (rowId === null) return { ok: false, message: "platform_settings row not found" };
  const { error } = await sb
    .from("platform_settings")
    .update({ watch_payout_gpc: Math.max(1, Math.floor(gpc)), updated_at: new Date().toISOString() })
    .eq("id", rowId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function getUserMembershipTier(userId: string): Promise<string> {
  const { data } = await supabase()
    .from("users")
    .select("membership, membership_tier")
    .eq("id", userId)
    .maybeSingle();
  const row = data as { membership?: string; membership_tier?: string } | null;
  return normalizeMembershipTier(row?.membership_tier ?? row?.membership);
}

export async function getUserGpcEarnedToday(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from("video_watch_completions")
    .select("gpc_awarded")
    .eq("user_id", userId)
    .gte("created_at", startOfTodayUtc());
  if (error) throw error;
  return (data ?? []).reduce((s, r) => s + Math.floor(Number((r as { gpc_awarded: number }).gpc_awarded)), 0);
}

export async function hasUserCompletedVideo(userId: string, videoId: string): Promise<boolean> {
  const { data } = await supabase()
    .from("video_watch_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();
  return !!data;
}

export async function getCompletedVideoIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase()
    .from("video_watch_completions")
    .select("video_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((r) => (r as { video_id: string }).video_id));
}

function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function videoMatchesTargetDemo(
  target: TargetDemo | null | undefined,
  user: { age: number | null; gender?: string | null; interests?: string[] }
): boolean {
  if (!target || Object.keys(target).length === 0) return true;
  if (target.age_min != null && user.age != null && user.age < target.age_min) return false;
  if (target.age_max != null && user.age != null && user.age > target.age_max) return false;
  if (target.gender && user.gender) {
    if (target.gender.toLowerCase() !== user.gender.toLowerCase()) return false;
  }
  if (target.interests?.length && user.interests?.length) {
    const want = new Set(target.interests.map((i) => i.toLowerCase()));
    const has = user.interests.some((i) => want.has(i.toLowerCase()));
    if (!has) return false;
  }
  return true;
}

export async function getUserDemoProfile(userId: string): Promise<{
  age: number | null;
  gender: string | null;
  interests: string[];
}> {
  const { data: userRow } = await supabase()
    .from("users")
    .select("date_of_birth")
    .eq("id", userId)
    .maybeSingle();
  const dob = (userRow as { date_of_birth?: string } | null)?.date_of_birth ?? null;
  const { data: profile } = await supabase()
    .from("profiles")
    .select("date_of_birth")
    .eq("id", userId)
    .maybeSingle();
  const profileDob = (profile as { date_of_birth?: string } | null)?.date_of_birth ?? null;
  return {
    age: ageFromDob(dob ?? profileDob),
    gender: null,
    interests: [],
  };
}

export function isVideoFeedable(v: CreatorVideoRow): boolean {
  if (v.status !== "approved") return false;
  if (v.spent_gpc >= v.budget_gpc) return false;
  return true;
}

export async function listFeedVideos(userId: string, limit = 20): Promise<CreatorVideoRow[]> {
  const completed = await getCompletedVideoIds(userId);
  const demo = await getUserDemoProfile(userId);

  const { data, error } = await supabase()
    .from("creator_videos")
    .select("*")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const rows = (data ?? []) as CreatorVideoRow[];
  return rows
    .filter((v) => isVideoFeedable(v) && !completed.has(v.id))
    .filter((v) => videoMatchesTargetDemo(v.target_demo, demo))
    .slice(0, limit);
}

export async function getVideoForWatch(videoId: string): Promise<CreatorVideoRow | null> {
  const { data, error } = await supabase()
    .from("creator_videos")
    .select("*")
    .eq("id", videoId)
    .maybeSingle();
  if (error) throw error;
  return data as CreatorVideoRow | null;
}

export async function startWatchSession(
  userId: string,
  videoId: string
): Promise<{ sessionId: string } | { error: string; status: number }> {
  const tier = await getUserMembershipTier(userId);
  const earnedToday = await getUserGpcEarnedToday(userId);
  const cap = dailyCapForTier(tier);
  if (earnedToday >= cap) {
    return { error: "Daily GPC earn limit reached for your membership tier", status: 400 };
  }

  if (await hasUserCompletedVideo(userId, videoId)) {
    return { error: "You already earned from this video", status: 400 };
  }

  const video = await getVideoForWatch(videoId);
  if (!video || video.status !== "approved") {
    return { error: "Video is not available", status: 404 };
  }
  if (!isVideoFeedable(video)) {
    return { error: "Video budget depleted", status: 400 };
  }

  const payout = await getWatchPayoutGpc();
  if (video.budget_gpc - video.spent_gpc < payout) {
    return { error: "Video budget depleted", status: 400 };
  }

  const { data, error } = await supabase()
    .from("video_watch_sessions")
    .insert({ user_id: userId, video_id: videoId })
    .select("id")
    .single();
  if (error) {
    return { error: error.message, status: 500 };
  }
  return { sessionId: (data as { id: string }).id };
}

export async function completeWatchSession(
  userId: string,
  sessionId: string
): Promise<
  | { success: true; gpcAwarded: number; alreadyCompleted?: boolean }
  | { error: string; status: number }
> {
  const { data: session, error: sessErr } = await supabase()
    .from("video_watch_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessErr || !session) {
    return { error: "Session not found", status: 404 };
  }
  const s = session as {
    id: string;
    user_id: string;
    video_id: string;
    started_at: string;
    completed_at: string | null;
    valid: boolean;
  };
  if (s.user_id !== userId) {
    return { error: "Forbidden", status: 403 };
  }

  const reference = `watch_${userId}_${s.video_id}`;

  const { data: existingCompletion } = await supabase()
    .from("video_watch_completions")
    .select("id, gpc_awarded")
    .eq("user_id", userId)
    .eq("video_id", s.video_id)
    .maybeSingle();
  if (existingCompletion) {
    return {
      success: true,
      gpcAwarded: Math.floor((existingCompletion as { gpc_awarded: number }).gpc_awarded),
      alreadyCompleted: true,
    };
  }

  const startedMs = new Date(s.started_at).getTime();
  if (Number.isNaN(startedMs) || Date.now() - startedMs > SESSION_MAX_AGE_MS) {
    return { error: "Watch session expired. Start again.", status: 400 };
  }

  const elapsedSec = (Date.now() - startedMs) / 1000;
  const valid = elapsedSec >= WATCH_SECONDS_REQUIRED;

  if (!s.completed_at) {
    await supabase()
      .from("video_watch_sessions")
      .update({
        completed_at: new Date().toISOString(),
        valid,
      })
      .eq("id", sessionId);
  }

  if (!valid) {
    return {
      error: `Watch at least ${WATCH_SECONDS_REQUIRED} seconds before completing`,
      status: 400,
    };
  }

  const tier = await getUserMembershipTier(userId);
  const earnedToday = await getUserGpcEarnedToday(userId);
  const cap = dailyCapForTier(tier);
  const payout = await getWatchPayoutGpc();

  if (earnedToday + payout > cap) {
    return { error: "Daily GPC earn limit reached for your membership tier", status: 400 };
  }

  const video = await getVideoForWatch(s.video_id);
  if (!video || video.status !== "approved") {
    return { error: "Video is not available", status: 400 };
  }
  const remaining = video.budget_gpc - video.spent_gpc;
  if (remaining < payout) {
    await supabase().from("creator_videos").update({ status: "depleted" }).eq("id", video.id);
    return { error: "Video budget depleted", status: 400 };
  }

  const credit = await creditGpayIdempotent(
    userId,
    payout,
    `Watch earn: ${video.title.slice(0, 80)}`,
    reference,
    "watch_earn"
  );
  if (!credit.success) {
    return { error: credit.message ?? "Could not credit GPC", status: 500 };
  }

  const { error: compErr } = await supabase().from("video_watch_completions").insert({
    video_id: s.video_id,
    user_id: userId,
    watch_session_id: sessionId,
    gpc_awarded: payout,
  });
  if (compErr) {
    if (compErr.code === "23505") {
      return { success: true, gpcAwarded: payout, alreadyCompleted: true };
    }
    console.error("[watch-earn] completion insert:", compErr);
    return { error: "Completion record failed", status: 500 };
  }

  const newSpent = video.spent_gpc + payout;
  const newViews = video.views_count + 1;
  const updates: Record<string, unknown> = {
    spent_gpc: newSpent,
    views_count: newViews,
  };
  if (newSpent >= video.budget_gpc) {
    updates.status = "depleted";
  }

  await supabase().from("creator_videos").update(updates).eq("id", video.id);

  return { success: true, gpcAwarded: payout };
}

export async function sumWatchEarnGpcSince(isoSince: string): Promise<number> {
  const { data, error } = await supabase()
    .from("coin_transactions")
    .select("gpay_coins")
    .eq("type", "watch_earn")
    .gte("created_at", isoSince);
  if (error) throw error;
  return (data ?? []).reduce(
    (s, r) => s + Math.max(0, Math.floor(Number((r as { gpay_coins?: number }).gpay_coins ?? 0))),
    0
  );
}
