/**
 * Viral referral system: viral_referrals, referral_rewards, gamification_rewards.
 * Double reward: $5 signup (friend), $10 first deposit (referrer). Commission by tier.
 */

import { createAdminClient } from "@/lib/supabase";

const SIGNUP_BONUS_CENTS = 500; // $5 for referred user
const DEPOSIT_BONUS_CENTS = 1000; // $10 for referrer when friend first deposits

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

/** Create viral_referral row and optionally grant $5 signup bonus to referred user. Idempotent by referred_user_id. */
export async function createReferral(params: {
  referrerUserId: string;
  referredUserId: string;
  referralCode: string;
  grantSignupBonus?: boolean;
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
    if (params.grantSignupBonus && referralId) {
      await grantSignupBonus(params.referredUserId, referralId);
      await grantReferrerGamification(params.referrerUserId, referralId);
    }
    return { success: true, referralId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create referral failed";
    return { success: false, message: msg };
  }
}

/** Grant $5 signup bonus to referred user and record in referral_rewards. */
export async function grantSignupBonus(referredUserId: string, referralId: string): Promise<boolean> {
  try {
    const { error: rewardErr } = await supabase().from("referral_rewards").insert({
      user_id: referredUserId,
      reward_type: "signup_bonus",
      amount: SIGNUP_BONUS_CENTS / 100,
      referral_id: referralId,
    });
    if (rewardErr) return false;

    const { error: ledgerErr } = await supabase().rpc("wallet_ledger_entry", {
      p_user_id: referredUserId,
      p_type: "referral_bonus",
      p_amount_cents: SIGNUP_BONUS_CENTS,
      p_reference: `signup_bonus_${referralId}`,
    });
    if (ledgerErr) {
      const { data: row } = await supabase().from("users").select("balance").eq("id", referredUserId).single();
      const cur = Number((row as { balance?: number })?.balance ?? 0);
      await supabase().from("users").update({ balance: cur + SIGNUP_BONUS_CENTS, updated_at: new Date().toISOString() }).eq("id", referredUserId);
    }
    return true;
  } catch {
    return false;
  }
}

/** Grant $10 deposit bonus to referrer when referred user makes first deposit. */
export async function grantDepositBonus(referredUserId: string): Promise<{ granted: boolean; referrerId?: string }> {
  try {
    const { data: ref } = await supabase()
      .from("viral_referrals")
      .select("id, referrer_user_id, status")
      .eq("referred_user_id", referredUserId)
      .in("status", ["joined"])
      .maybeSingle();
    if (!ref) return { granted: false };
    const row = ref as { id: string; referrer_user_id: string };
    const { error: rewardErr } = await supabase().from("referral_rewards").insert({
      user_id: row.referrer_user_id,
      reward_type: "deposit_bonus",
      amount: DEPOSIT_BONUS_CENTS / 100,
      referral_id: row.id,
    });
    if (rewardErr) return { granted: false };

    const { error: ledgerErr } = await supabase().rpc("wallet_ledger_entry", {
      p_user_id: row.referrer_user_id,
      p_type: "referral_bonus",
      p_amount_cents: DEPOSIT_BONUS_CENTS,
      p_reference: `deposit_bonus_${row.id}`,
    });
    if (ledgerErr) {
      const { data: u } = await supabase().from("users").select("balance").eq("id", row.referrer_user_id).single();
      const cur = Number((u as { balance?: number })?.balance ?? 0);
      await supabase().from("users").update({ balance: cur + DEPOSIT_BONUS_CENTS, updated_at: new Date().toISOString() }).eq("id", row.referrer_user_id);
    }

    await supabase().from("viral_referrals").update({ status: "deposited" }).eq("id", row.id);
    return { granted: true, referrerId: row.referrer_user_id };
  } catch {
    return { granted: false };
  }
}

/** Grant 1 free spin + 1 free pinball to referrer for a successful referral. */
async function grantReferrerGamification(referrerUserId: string, referralId: string): Promise<void> {
  try {
    await supabase().from("gamification_rewards").insert([
      { user_id: referrerUserId, reward_type: "free_spin", source: "referral", referral_id: referralId },
      { user_id: referrerUserId, reward_type: "free_pinball", source: "referral", referral_id: referralId },
    ]);
  } catch {
    // optional
  }
}

/** Leaderboard: rank, user id/email, total referrals, total earnings (from referral_rewards + referral_bonus). */
export async function getLeaderboard(limit = 50): Promise<
  { rank: number; userId: string; email: string; totalReferrals: number; totalEarningsCents: number }[]
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
      totalEarningsCents: earningsByUser.get(s.userId) ?? 0,
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

/** Total commissions/rewards paid (referral_rewards amount sum + referral_bonus). */
export async function getTotalCommissionsPaidCents(): Promise<number> {
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
