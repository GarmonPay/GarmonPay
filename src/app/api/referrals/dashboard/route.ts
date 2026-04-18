import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getReferralLink } from "@/lib/site-url";
import { referralCodeFromUserId } from "@/lib/referral-code";
import { createAdminClient } from "@/lib/supabase";
import { countUserReferrals, getUserReferralEarningsGpc } from "@/lib/viral-db";
import {
  getActiveReferralSubscriptionsCount,
  getMonthlyReferralCommissionGpc,
  getLifetimeReferralCommissionGpc,
} from "@/lib/referral-commissions-db";

/** Mask email for display (privacy). */
function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "—";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `${local}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

/**
 * GET /api/referrals/dashboard
 * Returns referral summary, referred users table data, and earnings history.
 * Secure: only current user's data (filtered by referrer).
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({
      summary: { totalReferrals: 0, activeReferrals: 0, monthlyReferralIncomeGpc: 0, lifetimeReferralEarningsGpc: 0, referralCode: "" },
      referralLink: "",
      referredUsers: [],
      earningsHistory: [],
    });
  }

  try {
    const { data: userRow } = await supabase.from("users").select("referral_code").eq("id", userId).single();
    let referralCode = (userRow as { referral_code?: string | null } | null)?.referral_code?.trim() ?? "";
    if (!referralCode) {
      const generated = referralCodeFromUserId(userId);
      await supabase.from("users").update({ referral_code: generated, updated_at: new Date().toISOString() }).eq("id", userId);
      referralCode = generated;
    }

    const [
      totalReferrals,
      activeReferrals,
      monthlyReferralIncomeGpc,
      lifetimeOneTimeGpc,
      lifetimeRecurringGpc,
    ] = await Promise.all([
      countUserReferrals(userId),
      getActiveReferralSubscriptionsCount(userId),
      getMonthlyReferralCommissionGpc(userId),
      getUserReferralEarningsGpc(userId),
      getLifetimeReferralCommissionGpc(userId),
    ]);
    const lifetimeReferralEarningsGpc = lifetimeOneTimeGpc + lifetimeRecurringGpc;

    const summary = {
      totalReferrals,
      activeReferrals,
      monthlyReferralIncomeGpc,
      lifetimeReferralEarningsGpc,
      referralCode,
    };

    type ReferredUserRow = {
      id: string;
      email: string;
      membership: string;
      full_name: string | null;
      created_at: string | null;
      membership_tier: string | null;
    };
    const referredUsersRaw =
      ((await supabase
        .from("users")
        .select("id, email, membership, full_name, created_at, membership_tier")
        .eq("referred_by", userId)
        .order("created_at", { ascending: false })).data ?? []) as ReferredUserRow[];

    const ids = referredUsersRaw.map((u) => u.id);
    if (ids.length === 0) {
      return NextResponse.json({
        summary,
        referralLink: getReferralLink(referralCode),
        referredUsers: [],
        earningsHistory: await getEarningsHistory(supabase, userId),
      });
    }

    const { data: subs } = await supabase
      .from("subscriptions")
      .select("user_id, status, membership_tier")
      .in("user_id", ids);
    const activeByUser = new Set((subs ?? []).filter((s: { status: string }) => s.status === "active").map((s: { user_id: string }) => s.user_id));
    const tierByUser = new Map((subs ?? []).map((s: { user_id: string; membership_tier: string }) => [s.user_id, s.membership_tier]));

    const { data: commissions } = await supabase
      .from("referral_commissions")
      .select("referred_user_id, commission_amount")
      .eq("referrer_user_id", userId)
      .eq("status", "active");
    const monthlyByUser = new Map(
      (commissions ?? []).map((c: { referred_user_id: string; commission_amount: number }) => [c.referred_user_id, Number(c.commission_amount)])
    );

    const { data: bonuses } = await supabase.from("referral_bonus").select("referred_user_id, amount").eq("referrer_id", userId).eq("status", "paid");
    const bonusByUser = new Map((bonuses ?? []).map((b: { referred_user_id: string; amount: number }) => [b.referred_user_id, Number(b.amount)]));

    const { data: rcRows } = await supabase.from("referral_commissions").select("id, referred_user_id").eq("referrer_user_id", userId);
    const rcIdToReferred = new Map((rcRows ?? []).map((r: { id: string; referred_user_id: string }) => [r.id, r.referred_user_id]));
    const { data: txRows } = await supabase
      .from("transactions")
      .select("id, amount, reference_id, type")
      .eq("user_id", userId)
      .in("type", ["referral_commission", "referral_upgrade"])
      .eq("status", "completed");
    const earnedByReferred = new Map<string, number>();
    const upgradePrefix = "referral_upgrade_";
    for (const t of txRows ?? []) {
      const refId = t.reference_id as string | null;
      if (!refId) continue;
      if (refId.startsWith(upgradePrefix)) {
        const referredId = refId.slice(upgradePrefix.length);
        if (referredId && /^[0-9a-f-]{36}$/i.test(referredId)) {
          earnedByReferred.set(referredId, (earnedByReferred.get(referredId) ?? 0) + Number(t.amount));
        }
        continue;
      }
      const referredId = rcIdToReferred.get(refId);
      if (referredId) {
        earnedByReferred.set(referredId, (earnedByReferred.get(referredId) ?? 0) + Number(t.amount));
      }
    }
    Array.from(bonusByUser.entries()).forEach(([referredId, bonus]) => {
      earnedByReferred.set(referredId, (earnedByReferred.get(referredId) ?? 0) + bonus);
    });

    const referredUsers = referredUsersRaw.map((u) => {
      const tier = (tierByUser.get(u.id) ?? u.membership_tier ?? u.membership ?? "free").toString();
      const displayName =
        (typeof u.full_name === "string" && u.full_name.trim() ? u.full_name.trim() : null) ?? maskEmail(u.email);
      return {
        referredUserId: u.id,
        email: maskEmail(u.email),
        name: displayName,
        joinedAt: u.created_at ?? "",
        membership: tier,
        status: activeByUser.has(u.id) ? "Active" : "Inactive",
        monthlyCommissionGpc: monthlyByUser.get(u.id) ?? 0,
        totalEarnedGpc: earnedByReferred.get(u.id) ?? 0,
      };
    });

    const earningsHistory = await getEarningsHistory(supabase, userId);
    const referralLink = getReferralLink(referralCode);

    return NextResponse.json({
      summary,
      referralLink,
      referredUsers,
      earningsHistory,
    });
  } catch (e) {
    console.error("Referrals dashboard error:", e);
    const emptySummary = {
      totalReferrals: 0,
      activeReferrals: 0,
      monthlyReferralIncomeGpc: 0,
      lifetimeReferralEarningsGpc: 0,
      referralCode: "",
    };
    return NextResponse.json({
      summary: emptySummary,
      referralLink: "",
      referredUsers: [],
      earningsHistory: [],
    });
  }
}

async function getEarningsHistory(supabase: NonNullable<ReturnType<typeof createAdminClient>>, userId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, type, amount, status, description, created_at")
    .eq("user_id", userId)
    .in("type", ["referral", "referral_commission", "referral_upgrade"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r: { id: string; type: string; amount: number; status: string; description: string | null; created_at: string }) => ({
    id: r.id,
    type: r.type,
    amountGpc: Number(r.amount),
    status: r.status,
    description: r.description ?? (r.type === "referral_commission" ? "Referral commission" : "Referral"),
    createdAt: r.created_at,
  }));
}
