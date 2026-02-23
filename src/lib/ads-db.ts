/**
 * Ads, ad_sessions, earnings — Supabase backend.
 * Rewards issued only via completeAdSessionAndIssueReward (and DB function).
 */

import { createAdminClient } from "@/lib/supabase";

const COOLDOWN_HOURS = 24;

export type AdTypeDb = "video" | "image" | "text" | "link";

export interface AdRow {
  id: string;
  title: string;
  description: string | null;
  type: AdTypeDb;
  media_url: string | null;
  advertiser_price: number;
  user_reward: number;
  profit_amount: number;
  duration_seconds: number;
  status: string;
  created_at: string;
}

export interface AdSessionRow {
  id: string;
  user_id: string;
  ad_id: string;
  start_time: string;
  completed: boolean;
  reward_given: boolean;
}

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

/** List active ads for members. */
export async function listAds(): Promise<AdRow[]> {
  const { data, error } = await supabase()
    .from("ads")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdRow[];
}

/** List all ads (admin). */
export async function listAllAds(): Promise<AdRow[]> {
  const { data, error } = await supabase()
    .from("ads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdRow[];
}

/** Get one ad by id. */
export async function getAdById(id: string): Promise<AdRow | null> {
  const { data, error } = await supabase().from("ads").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as AdRow | null;
}

/** Create ad (admin). profit_amount = advertiser_price - user_reward. */
export async function createAd(params: {
  title: string;
  description?: string;
  type: AdTypeDb;
  media_url?: string | null;
  advertiser_price: number;
  user_reward: number;
  duration_seconds: number;
  status?: "active" | "inactive";
}): Promise<AdRow> {
  const profit_amount = Math.max(0, params.advertiser_price - params.user_reward);
  const { data, error } = await supabase()
    .from("ads")
    .insert({
      title: params.title,
      description: params.description ?? "",
      type: params.type,
      media_url: params.media_url ?? null,
      advertiser_price: params.advertiser_price,
      user_reward: params.user_reward,
      profit_amount,
      duration_seconds: Math.max(1, params.duration_seconds),
      status: params.status ?? "active",
    })
    .select()
    .single();
  if (error) throw error;
  return data as AdRow;
}

/** Update ad (admin). Recompute profit_amount if pricing fields change. */
export async function updateAd(
  id: string,
  updates: Partial<{
    title: string;
    description: string;
    type: AdTypeDb;
    media_url: string | null;
    advertiser_price: number;
    user_reward: number;
    duration_seconds: number;
    status: "active" | "inactive";
  }>
): Promise<AdRow> {
  const row = await getAdById(id);
  if (!row) throw new Error("Ad not found");
  const advertiser_price = updates.advertiser_price ?? row.advertiser_price;
  const user_reward = updates.user_reward ?? row.user_reward;
  const profit_amount = Math.max(0, advertiser_price - user_reward);
  const { data, error } = await supabase()
    .from("ads")
    .update({
      ...updates,
      profit_amount,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as AdRow;
}

/** Start ad session. Enforces cooldown: no repeat reward for same user+ad within COOLDOWN_HOURS. */
export async function startAdSession(userId: string, adId: string): Promise<AdSessionRow | null> {
  const ad = await getAdById(adId);
  if (!ad || ad.status !== "active") return null;

  const { data: recent } = await supabase()
    .from("ad_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("ad_id", adId)
    .eq("reward_given", true)
    .gte("start_time", new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();
  if (recent) return null;

  const { data: session, error } = await supabase()
    .from("ad_sessions")
    .insert({ user_id: userId, ad_id: adId })
    .select()
    .single();
  if (error) return null;
  return session as AdSessionRow;
}

export async function getSessionById(sessionId: string): Promise<AdSessionRow | null> {
  const { data, error } = await supabase()
    .from("ad_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return data as AdSessionRow | null;
}

/**
 * Complete session and issue reward. Uses DB function so balance + earnings + session update are atomic.
 * Returns { success, rewardCents } or { success, message }.
 */
export async function completeAdSessionAndIssueReward(
  userId: string,
  sessionId: string
): Promise<{ success: true; rewardCents: number } | { success: false; message: string }> {
  const { data, error } = await supabase().rpc("complete_ad_session_and_issue_reward", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  if (error) return { success: false, message: error.message };
  const result = data as { success: boolean; message?: string; rewardCents?: number };
  if (result.success && typeof result.rewardCents === "number") {
    return { success: true, rewardCents: result.rewardCents };
  }
  return { success: false, message: (result as { message?: string }).message ?? "Failed" };
}

/** Get earnings for user (today, this week, this month). */
export async function getEarningsForUser(userId: string): Promise<{
  todayCents: number;
  weekCents: number;
  monthCents: number;
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [today, week, month] = await Promise.all([
    supabase()
      .from("earnings")
      .select("amount")
      .eq("user_id", userId)
      .gte("created_at", todayStart),
    supabase()
      .from("earnings")
      .select("amount")
      .eq("user_id", userId)
      .gte("created_at", weekStart),
    supabase()
      .from("earnings")
      .select("amount")
      .eq("user_id", userId)
      .gte("created_at", monthStart),
  ]);

  const sum = (res: { data?: unknown } | null) => {
    const arr = Array.isArray(res?.data) ? res.data : [];
    return (arr as { amount?: number }[]).reduce((a, r) => a + Number(r?.amount ?? 0), 0);
  };

  return {
    todayCents: sum(today),
    weekCents: sum(week),
    monthCents: sum(month),
  };
}
