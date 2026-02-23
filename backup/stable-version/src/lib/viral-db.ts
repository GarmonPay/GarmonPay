/**
 * Viral growth: leaderboards, daily rewards, badges, activity feed, referral bonus.
 * All rewards server-side. No fake data.
 */

import { createAdminClient } from "@/lib/supabase";

const DAILY_REWARD_CENTS = 25;
const REFERRAL_BONUS_CENTS = 50;

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

/** Top referrers: user id, email (name), total referrals, total referral earnings (from referral_bonus). */
export async function getTopReferrers(limit = 20): Promise<
  { userId: string; email: string; totalReferrals: number; totalEarningsCents: number }[]
> {
  const { data: bonuses } = await supabase()
    .from("referral_bonus")
    .select("referrer_id, amount, status")
    .eq("status", "paid");
  const byReferrer = new Map<string, { count: number; cents: number }>();
  for (const b of bonuses ?? []) {
    const r = b as { referrer_id: string; amount: number };
    const cur = byReferrer.get(r.referrer_id) ?? { count: 0, cents: 0 };
    cur.count += 1;
    cur.cents += Number(r.amount);
    byReferrer.set(r.referrer_id, cur);
  }
  const sorted = Array.from(byReferrer.entries())
    .map(([userId, v]) => ({ userId, count: v.count, cents: v.cents }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
  const userIds = sorted.map((s) => s.userId);
  const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
  const emailMap = new Map((users ?? []).map((u: { id: string; email: string }) => [u.id, u.email]));
  return sorted.map((s) => ({
    userId: s.userId,
    email: emailMap.get(s.userId) ?? "—",
    totalReferrals: s.count,
    totalEarningsCents: s.cents,
  }));
}


/** Top earners: from transactions type=earning+referral, sum amount. */
export async function getTopEarners(limit = 20): Promise<
  { userId: string; email: string; totalEarningsCents: number }[]
> {
  const { data: tx } = await supabase()
    .from("transactions")
    .select("user_id, amount, type, status")
    .in("type", ["earning", "referral"])
    .eq("status", "completed");
  const byUser = new Map<string, number>();
  for (const t of tx ?? []) {
    const r = t as { user_id: string; amount: number };
    byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + Number(r.amount));
  }
  const sorted = Array.from(byUser.entries())
    .map(([userId, cents]) => ({ userId, totalEarningsCents: cents }))
    .sort((a, b) => b.totalEarningsCents - a.totalEarningsCents)
    .slice(0, limit);
  const userIds = sorted.map((s) => s.userId);
  const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
  const emailMap = new Map((users ?? []).map((u: { id: string; email: string }) => [u.id, u.email]));
  return sorted.map((s) => ({
    userId: s.userId,
    email: emailMap.get(s.userId) ?? "—",
    totalEarningsCents: s.totalEarningsCents,
  }));
}

/** Referral rank (1-based) for a user by total referrals. */
export async function getReferrerRank(userId: string): Promise<number | null> {
  const list = await getTopReferrers(500);
  const idx = list.findIndex((r) => r.userId === userId);
  return idx === -1 ? null : idx + 1;
}

/** Claim daily reward. Returns success and amount or error. */
export async function claimDailyReward(userId: string): Promise<
  { success: true; amountCents: number } | { success: false; message: string }
> {
  const { data, error } = await supabase().rpc("claim_daily_reward", {
    p_user_id: userId,
    p_reward_cents: DAILY_REWARD_CENTS,
  });
  if (error) return { success: false, message: error.message };
  const r = data as { success: boolean; message?: string; amountCents?: number };
  if (r.success && typeof r.amountCents === "number") return { success: true, amountCents: r.amountCents };
  return { success: false, message: (r as { message?: string }).message ?? "Already claimed today" };
}

/** Check if user can claim daily (last claim before today). */
export async function canClaimDaily(userId: string): Promise<boolean> {
  const { data } = await supabase().from("daily_rewards").select("last_claim_date").eq("user_id", userId).maybeSingle();
  const last = (data as { last_claim_date?: string } | null)?.last_claim_date;
  if (!last) return true;
  const today = new Date().toISOString().slice(0, 10);
  return last < today;
}

/** Grant referral bonus for a referred user (idempotent, one per referred user). */
export async function grantReferralBonusForUser(referredUserId: string): Promise<
  { success: boolean; message?: string; referrerId?: string }
> {
  const { data, error } = await supabase().rpc("grant_referral_bonus_for_user", {
    p_referred_user_id: referredUserId,
    p_bonus_cents: REFERRAL_BONUS_CENTS,
  });
  if (error) return { success: false, message: error.message };
  const r = data as { success: boolean; message?: string; referrer_id?: string };
  return { success: r.success, message: r.message, referrerId: r.referrer_id };
}

/** Recent platform activities for feed. */
export async function getRecentActivities(limit = 30): Promise<
  { id: string; userId: string | null; email: string; activityType: string; description: string; amountCents: number | null; createdAt: string }[]
> {
  const { data, error } = await supabase()
    .from("platform_activities")
    .select("id, user_id, activity_type, description, amount_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; user_id: string | null; activity_type: string; description: string; amount_cents: number | null; created_at: string }[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
  const emailMap = new Map((users ?? []).map((u: { id: string; email: string }) => [u.id, u.email]));
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    email: r.user_id ? (emailMap.get(r.user_id) ?? "User") : "—",
    activityType: r.activity_type,
    description: r.description,
    amountCents: r.amount_cents != null ? Number(r.amount_cents) : null,
    createdAt: r.created_at,
  }));
}

/** List badges (all). */
export async function listBadges(): Promise<{ id: string; code: string; name: string; description: string; icon: string }[]> {
  const { data, error } = await supabase().from("badges").select("id, code, name, description, icon").order("code");
  if (error) throw error;
  return (data ?? []) as { id: string; code: string; name: string; description: string; icon: string }[];
}

/** User's earned badges. */
export async function getUserBadges(userId: string): Promise<{ badgeId: string; code: string; name: string; description: string; icon: string; earnedAt: string }[]> {
  const { data: ub } = await supabase().from("user_badges").select("badge_id, earned_at").eq("user_id", userId);
  if (!ub?.length) return [];
  const badgeIds = ub.map((u: { badge_id: string }) => u.badge_id);
  const { data: b } = await supabase().from("badges").select("id, code, name, description, icon").in("id", badgeIds);
  const badgeMap = new Map((b ?? []).map((x: { id: string; code: string; name: string; description: string; icon: string }) => [x.id, x]));
  return ub.map((u: { badge_id: string; earned_at: string }) => {
    const badge = badgeMap.get(u.badge_id);
    return {
      badgeId: u.badge_id,
      code: badge?.code ?? "",
      name: badge?.name ?? "",
      description: badge?.description ?? "",
      icon: badge?.icon ?? "",
      earnedAt: u.earned_at,
    };
  });
}

/** Award badge to user (idempotent). */
export async function awardBadge(userId: string, badgeCode: string): Promise<void> {
  const { data: badge } = await supabase().from("badges").select("id").eq("code", badgeCode).maybeSingle();
  if (!badge) return;
  const badgeId = (badge as { id: string }).id;
  const { error } = await supabase().from("user_badges").insert({ user_id: userId, badge_id: badgeId }).select();
  if (error?.code === "23505") return; // unique violation = already has badge
  if (error) throw error;
}

/** Count user's referrals (users who have referred_by_code = this user's referral_code). */
export async function countUserReferrals(userId: string): Promise<number> {
  const { data: user } = await supabase().from("users").select("referral_code").eq("id", userId).single();
  const code = (user as { referral_code?: string } | null)?.referral_code;
  if (!code) return 0;
  const { count } = await supabase().from("users").select("id", { count: "exact", head: true }).eq("referred_by_code", code);
  return count ?? 0;
}

/** Total referral earnings for user (from referral_bonus). */
export async function getUserReferralEarningsCents(userId: string): Promise<number> {
  const { data } = await supabase().from("referral_bonus").select("amount").eq("referrer_id", userId).eq("status", "paid");
  return (data ?? []).reduce((sum, r) => sum + Number((r as { amount: number }).amount), 0);
}

/** Ensure badges are awarded based on current state (first earnings, first withdrawal, top referrer, vip). */
export async function ensureBadgesAwarded(userId: string): Promise<void> {
  const { data: tx } = await supabase()
    .from("transactions")
    .select("type, status")
    .eq("user_id", userId)
    .in("type", ["earning", "withdrawal"])
    .eq("status", "completed");
  const hasEarning = (tx ?? []).some((t: { type: string }) => t.type === "earning");
  const hasWithdrawal = (tx ?? []).some((t: { type: string }) => t.type === "withdrawal");
  const rank = await getReferrerRank(userId);
  const { data: u } = await supabase().from("users").select("membership").eq("id", userId).single();
  const isVip = (u as { membership?: string } | null)?.membership === "vip";
  if (hasEarning) await awardBadge(userId, "first_earnings");
  if (hasWithdrawal) await awardBadge(userId, "first_withdrawal");
  if (rank !== null && rank <= 10) await awardBadge(userId, "top_referrer");
  if (isVip) await awardBadge(userId, "vip_member");
}

/** Record activity (earned, withdrew). Call from API after balance-changing actions. */
export async function recordActivity(
  userId: string,
  activityType: "earned" | "withdrew",
  description: string,
  amountCents?: number
): Promise<void> {
  await supabase().from("platform_activities").insert({
    user_id: userId,
    activity_type: activityType,
    description,
    amount_cents: amountCents ?? null,
  });
}
