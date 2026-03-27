/**
 * GarmonPay advertiser-driven ads: garmon_ads, garmon_ad_engagements, garmon_user_ad_earnings.
 * All balance changes go through wallet_ledger (ad_earning) and atomic RPC where needed.
 */

import { createAdminClient } from "@/lib/supabase";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export type GarmonAdType = "video" | "banner" | "social" | "product";
export type GarmonAdStatus = "pending" | "active" | "paused" | "completed" | "rejected";
export type GarmonEngagementTypeDb = "view" | "click" | "follow" | "share" | "banner_view";

export interface GarmonAdvertiserRow {
  id: string;
  user_id: string;
  business_name: string;
  category: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  is_verified: boolean;
  is_active: boolean;
  total_spent: number;
  created_at: string;
}

export interface GarmonAdRow {
  id: string;
  advertiser_id: string;
  user_id: string;
  title: string;
  description: string | null;
  ad_type: GarmonAdType;
  media_url: string | null;
  thumbnail_url: string | null;
  destination_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  twitch_url: string | null;
  total_budget: number;
  remaining_budget: number;
  cost_per_view: number;
  cost_per_click: number;
  cost_per_follow: number;
  cost_per_share: number;
  target_age_min: number;
  target_age_max: number;
  target_locations: string[] | null;
  target_interests: string[] | null;
  status: GarmonAdStatus;
  rejection_reason: string | null;
  views: number;
  clicks: number;
  follows: number;
  shares: number;
  total_paid_to_users: number;
  total_admin_cut: number;
  /** SKU from `ad_packages` when the campaign was created from the dashboard picker. */
  ad_package_id?: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GarmonAdWithAdvertiser extends GarmonAdRow {
  advertisers?: GarmonAdvertiserRow | null;
}

/** Get advertiser by user_id. */
export async function getAdvertiserByUserId(userId: string): Promise<GarmonAdvertiserRow | null> {
  const { data, error } = await supabase()
    .from("advertisers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as GarmonAdvertiserRow | null;
}

/** Create advertiser profile. */
export async function createAdvertiser(params: {
  user_id: string;
  business_name: string;
  category?: string | null;
  website?: string | null;
  description?: string | null;
  logo_url?: string | null;
}): Promise<GarmonAdvertiserRow> {
  const { data, error } = await supabase()
    .from("advertisers")
    .insert({
      user_id: params.user_id,
      business_name: params.business_name,
      category: params.category ?? null,
      website: params.website ?? null,
      description: params.description ?? null,
      logo_url: params.logo_url ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as GarmonAdvertiserRow;
}

/** Get active ads for feed: status=active, is_active=true, remaining_budget > 0. */
export async function getActiveGarmonAds(limit: number): Promise<GarmonAdWithAdvertiser[]> {
  const { data, error } = await supabase()
    .from("garmon_ads")
    .select("*, advertisers(*)")
    .eq("status", "active")
    .eq("is_active", true)
    .gt("remaining_budget", 0)
    .order("cost_per_view", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as GarmonAdWithAdvertiser[];
}

/** Get ad by id. */
export async function getGarmonAdById(id: string): Promise<GarmonAdRow | null> {
  const { data, error } = await supabase()
    .from("garmon_ads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as GarmonAdRow | null;
}

/** Get ads that user has already engaged with today (ad ids). */
export async function getEngagedAdIdsToday(userId: string): Promise<Set<string>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();
  const { data, error } = await supabase()
    .from("garmon_ad_engagements")
    .select("ad_id")
    .eq("user_id", userId)
    .gte("created_at", todayStart);
  if (error) throw error;
  const set = new Set<string>();
  (data ?? []).forEach((r: { ad_id: string }) => set.add(r.ad_id));
  return set;
}

/** Get count of engagements today for this user for this advertiser. */
export async function getEngagementsCountForAdvertiserToday(
  userId: string,
  advertiserId: string
): Promise<number> {
  const { data: adRows } = await supabase()
    .from("garmon_ads")
    .select("id")
    .eq("advertiser_id", advertiserId);
  const adIds = (adRows ?? []).map((r: { id: string }) => r.id);
  if (adIds.length === 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();
  const { count, error } = await supabase()
    .from("garmon_ad_engagements")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("ad_id", adIds)
    .gte("created_at", todayStart);
  if (error) throw error;
  return count ?? 0;
}

/** Get user's total ad earnings today (from garmon_user_ad_earnings, in dollars). */
export async function getUserAdEarningsTodayDollars(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();
  const { data, error } = await supabase()
    .from("garmon_user_ad_earnings")
    .select("amount")
    .eq("user_id", userId)
    .eq("status", "credited")
    .gte("credited_at", todayStart);
  if (error) throw error;
  return (data ?? []).reduce((sum: number, r: { amount: number }) => sum + Number(r.amount), 0);
}

/** Check if user has fraud flag. */
export async function hasUserFraudFlag(userId: string): Promise<boolean> {
  const { count, error } = await supabase()
    .from("garmon_ad_fraud_flags")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Check if user is banned from ad earnings. */
export async function isUserBannedFromAds(userId: string): Promise<boolean> {
  const { data, error } = await supabase()
    .from("garmon_ad_banned_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

/** Check if IP is in blocklist (prefix match). */
export async function isIpBlocked(ip: string): Promise<boolean> {
  if (!ip || ip === "unknown") return false;
  const { data, error } = await supabase()
    .from("garmon_blocked_ips")
    .select("ip_prefix");
  if (error) throw error;
  const prefixes = (data ?? []) as { ip_prefix: string }[];
  return prefixes.some((p) => p.ip_prefix && ip.startsWith(p.ip_prefix));
}

/** Get engagements count for same ad by user in last 24 hours. */
export async function getEngagementsSameAdLast24h(userId: string, adId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase()
    .from("garmon_ad_engagements")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("ad_id", adId)
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

/** Get engagements count for same advertiser by user today. */
export async function getEngagementsSameAdvertiserToday(
  userId: string,
  advertiserId: string
): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: adIds } = await supabase()
    .from("garmon_ads")
    .select("id")
    .eq("advertiser_id", advertiserId);
  const ids = (adIds ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return 0;
  const { count, error } = await supabase()
    .from("garmon_ad_engagements")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("ad_id", ids)
    .gte("created_at", todayStart.toISOString());
  if (error) throw error;
  return count ?? 0;
}

/** List ads by advertiser (user_id). */
export async function getGarmonAdsByUserId(userId: string): Promise<GarmonAdRow[]> {
  const { data, error } = await supabase()
    .from("garmon_ads")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GarmonAdRow[];
}

/** Get user ad earnings summary (today, week, month, all time). */
export async function getUserGarmonEarningsSummary(userId: string): Promise<{
  todayDollars: number;
  weekDollars: number;
  monthDollars: number;
  totalDollars: number;
  byType: Record<string, number>;
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: rows, error } = await supabase()
    .from("garmon_user_ad_earnings")
    .select("amount, engagement_type, credited_at")
    .eq("user_id", userId)
    .eq("status", "credited")
    .not("credited_at", "is", null);
  if (error) throw error;
  const list = (rows ?? []) as { amount: number; engagement_type: string; credited_at: string }[];

  let todayDollars = 0,
    weekDollars = 0,
    monthDollars = 0,
    totalDollars = 0;
  const byType: Record<string, number> = {};
  for (const r of list) {
    const amt = Number(r.amount);
    totalDollars += amt;
    if (r.credited_at >= monthStart) monthDollars += amt;
    if (r.credited_at >= weekStart) weekDollars += amt;
    if (r.credited_at >= todayStart) todayDollars += amt;
    byType[r.engagement_type] = (byType[r.engagement_type] ?? 0) + amt;
  }
  return { todayDollars, weekDollars, monthDollars, totalDollars, byType };
}

/** Get blocked keywords for moderation. */
export async function getBlockedKeywords(): Promise<string[]> {
  const { data, error } = await supabase()
    .from("garmon_ad_blocked_keywords")
    .select("keyword");
  if (error) return [];
  return (data ?? []).map((r: { keyword: string }) => r.keyword);
}

/** Check ad content against blocked keywords. Returns first match or null if clean. */
export async function checkAdContentModeration(
  title: string,
  description: string
): Promise<{ blocked: boolean; reason?: string }> {
  const keywords = await getBlockedKeywords();
  const text = `${(title ?? "").toLowerCase()} ${(description ?? "").toLowerCase()}`;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      return { blocked: true, reason: `Content contains blocked term` };
    }
  }
  return { blocked: false };
}

/** Update or insert ad streak for user (call after successful engagement). */
export async function updateAdStreak(userId: string): Promise<{ streakDays: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const { data: row } = await supabase()
    .from("garmon_ad_streak")
    .select("last_activity_date, streak_days")
    .eq("user_id", userId)
    .maybeSingle();
  const r = row as { last_activity_date: string; streak_days: number } | null;
  let newDays = 1;
  if (r) {
    const last = r.last_activity_date?.slice(0, 10);
    if (last === today) return { streakDays: r.streak_days };
    if (last === yesterday) newDays = r.streak_days + 1;
  }
  await supabase()
    .from("garmon_ad_streak")
    .upsert(
      { user_id: userId, last_activity_date: today, streak_days: newDays, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  return { streakDays: newDays };
}

/** Create ad (status pending for review). */
export async function createGarmonAd(params: {
  advertiser_id: string;
  user_id: string;
  title: string;
  description?: string | null;
  ad_type: GarmonAdType;
  media_url?: string | null;
  thumbnail_url?: string | null;
  destination_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  twitter_url?: string | null;
  facebook_url?: string | null;
  twitch_url?: string | null;
  total_budget: number;
  remaining_budget: number;
  cost_per_view?: number;
  cost_per_click?: number;
  cost_per_follow?: number;
  cost_per_share?: number;
  ad_package_id?: string | null;
  status?: GarmonAdStatus;
  rejection_reason?: string | null;
}): Promise<GarmonAdRow> {
  const { data, error } = await supabase()
    .from("garmon_ads")
    .insert({
      advertiser_id: params.advertiser_id,
      user_id: params.user_id,
      title: params.title,
      description: params.description ?? null,
      ad_type: params.ad_type,
      media_url: params.media_url ?? null,
      thumbnail_url: params.thumbnail_url ?? null,
      destination_url: params.destination_url ?? null,
      instagram_url: params.instagram_url ?? null,
      tiktok_url: params.tiktok_url ?? null,
      youtube_url: params.youtube_url ?? null,
      twitter_url: params.twitter_url ?? null,
      facebook_url: params.facebook_url ?? null,
      twitch_url: params.twitch_url ?? null,
      total_budget: params.total_budget,
      remaining_budget: params.remaining_budget,
      cost_per_view: params.cost_per_view ?? 0.02,
      cost_per_click: params.cost_per_click ?? 0.1,
      cost_per_follow: params.cost_per_follow ?? 0.1,
      cost_per_share: params.cost_per_share ?? 0.06,
      ad_package_id: params.ad_package_id ?? null,
      status: params.status ?? "pending",
      rejection_reason: params.rejection_reason ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as GarmonAdRow;
}
