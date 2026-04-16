/**
 * Viral referral system: viral_referrals, referral_rewards (tracking).
 * Wallet credits from signup / deposit bonuses are disabled; membership upgrade commissions use Stripe-backed flows.
 */

import { createAdminClient } from "@/lib/supabase";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export type ViralReferralStatus = "pending" | "joined" | "deposited" | "subscribed";

export interface ViralReferralRow {
  id: string;
  referrer_user_id: string;
  referred_user_id: string;
  referral_code: string;
  status: ViralReferralStatus;
  created_at: string;
}

/** Create viral_referral row. Idempotent by referred_user_id. No wallet grants. */
export async function createReferral(params: {
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
  referrerIp?: string | null;
  referredIp?: string | null;
  deviceFingerprint?: string | null;
}): Promise<{ success: boolean; message?: string; referralId?: string }> {
  try {
    if (params.referrerUserId === params.referredUserId) {
      return { success: false, message: "Self-referral not allowed" };
    }
    const code = String(params.referralCode || "").trim();
    if (!code) return { success: false, message: "Invalid referral code" };

    const { data: existing } = await supabase()
      .from("viral_referrals")
      .select("id, status")
      .eq("referred_user_id", params.referredUserId)
      .maybeSingle();
    if (existing) {
      return { success: true, referralId: (existing as { id: string }).id };
    }

    const { data: inserted, error } = await supabase()
      .from("viral_referrals")
      .insert({
        referrer_user_id: params.referrerUserId,
        referred_user_id: params.referredUserId,
        referral_code: code,
        status: "joined",
        referrer_ip: params.referrerIp ?? null,
        referred_ip: params.referredIp ?? null,
        device_fingerprint: params.deviceFingerprint ?? null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return { success: true }; // unique
      return { success: false, message: error.message };
    }

    const referralId = (inserted as { id: string })?.id;
    return { success: true, referralId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create referral failed";
    return { success: false, message: msg };
  }
}

/** Leaderboard: rank, user id/email, total referrals, total earnings (from referral_rewards + referral_bonus). */
export async function getLeaderboard(limit = 50): Promise<
  { rank: number; userId: string; email: string; totalReferrals: number; totalEarningsGpc: number }[]
> {
  try {
    const { data: refs } = await supabase().from("viral_referrals").select("referrer_user_id");
    const countByUser = new Map<string, number>();
    for (const r of refs ?? []) {
      const uid = (r as { referrer_user_id: string }).referrer_user_id;
      countByUser.set(uid, (countByUser.get(uid) ?? 0) + 1);
    }
    const sorted = Array.from(countByUser.entries())
      .map(([userId, totalReferrals]) => ({ userId, totalReferrals }))
      .sort((a, b) => b.totalReferrals - a.totalReferrals)
      .slice(0, limit);

    const userIds = sorted.map((s) => s.userId);
    const { data: rewards } = await supabase()
      .from("referral_rewards")
      .select("user_id, amount")
      .in("user_id", userIds)
      .in("reward_type", ["deposit_bonus", "subscription_commission"]);
    const earningsByUser = new Map<string, number>();
    for (const r of rewards ?? []) {
      const uid = (r as { user_id: string; amount: number }).user_id;
      const cents = Math.round(Number((r as { amount: number }).amount) * 100);
      earningsByUser.set(uid, (earningsByUser.get(uid) ?? 0) + cents);
    }
    const { data: bonus } = await supabase().from("referral_bonus").select("referrer_id, amount").eq("status", "paid").in("referrer_id", userIds);
    for (const b of bonus ?? []) {
      const uid = (b as { referrer_id: string; amount: number }).referrer_id;
      earningsByUser.set(uid, (earningsByUser.get(uid) ?? 0) + Number((b as { amount: number }).amount));
    }

    const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
    const emailMap = new Map((users ?? []).map((u: { id: string; email: string }) => [u.id, u.email]));

    return sorted.map((s, i) => ({
      rank: i + 1,
      userId: s.userId,
      email: (emailMap.get(s.userId) ?? "—").toString(),
      totalReferrals: s.totalReferrals,
      totalEarningsGpc: earningsByUser.get(s.userId) ?? 0,
    }));
  } catch {
    return [];
  }
}

/** My referrals for current user. */
export async function getMyReferrals(referrerUserId: string): Promise<
  { referredUserId: string; email: string; status: ViralReferralStatus; createdAt: string }[]
> {
  try {
    const { data } = await supabase()
      .from("viral_referrals")
      .select("referred_user_id, status, created_at")
      .eq("referrer_user_id", referrerUserId)
      .order("created_at", { ascending: false });
    if (!data?.length) return [];
    const ids = (data as { referred_user_id: string }[]).map((r) => r.referred_user_id);
    const { data: users } = await supabase().from("users").select("id, email").in("id", ids);
    const emailMap = new Map((users ?? []).map((u: { id: string; email: string }) => [u.id, u.email]));
    return (data as { referred_user_id: string; status: string; created_at: string }[]).map((r) => ({
      referredUserId: r.referred_user_id,
      email: emailMap.get(r.referred_user_id) ?? "—",
      status: r.status as ViralReferralStatus,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/** Total referrals count (platform-wide). */
export async function getTotalReferralsCount(): Promise<number> {
  const { count, error } = await supabase().from("viral_referrals").select("id", { count: "exact", head: true });
  return error ? 0 : (count ?? 0);
}

/** Total commissions/rewards paid in GPC (referral_rewards + referral_bonus; 100 GPC ≈ $1). */
export async function getTotalCommissionsPaidGpc(): Promise<number> {
  try {
    const { data: rewards } = await supabase().from("referral_rewards").select("amount");
    let sum = 0;
    for (const r of rewards ?? []) sum += Math.round(Number((r as { amount: number }).amount) * 100);
    const { data: bonus } = await supabase().from("referral_bonus").select("amount").eq("status", "paid");
    for (const b of bonus ?? []) sum += Number((b as { amount: number }).amount);
    return sum;
  } catch {
    return 0;
  }
}
