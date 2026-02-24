import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { countUserReferrals, getUserReferralEarningsCents } from "@/lib/viral-db";
import {
  getActiveReferralSubscriptionsCount,
  getMonthlyReferralCommissionCents,
  getLifetimeReferralCommissionCents,
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
      summary: { totalReferrals: 0, activeReferrals: 0, monthlyReferralIncomeCents: 0, lifetimeReferralEarningsCents: 0, referralCode: "" },
      referralLink: "",
      referredUsers: [],
      earningsHistory: [],
    });
  }

  try {
    const { data: userRow } = await supabase
      .from("users")
      .select("referral_code")
      .eq("id", userId)
      .single();
    const referralCode = (userRow as { referral_code?: string } | null)?.referral_code ?? "";

    const [
      totalReferrals,
      activeReferrals,
      monthlyReferralIncomeCents,
      lifetimeOneTimeCents,
      lifetimeRecurringCents,
    ] = await Promise.all([
      countUserReferrals(userId),
      getActiveReferralSubscriptionsCount(userId),
      getMonthlyReferralCommissionCents(userId),
      getUserReferralEarningsCents(userId),
      getLifetimeReferralCommissionCents(userId),
    ]);
    const lifetimeReferralEarningsCents = lifetimeOneTimeCents + lifetimeRecurringCents;

    const summary = {
      totalReferrals,
      activeReferrals,
      monthlyReferralIncomeCents,
      lifetimeReferralEarningsCents,
      referralCode,
    };

    const referredIds: string[] = [];
    if (referralCode) {
      const { data: referred } = await supabase
        .from("users")
        .select("id, email, membership")
        .eq("referred_by_code", referralCode);
      referredIds.push(...(referred ?? []).map((r: { id: string }) => r.id));
    }

    type ReferredUserRow = { id: string; email: string; membership: string };
    const referredUsersRaw = referralCode
      ? ((await supabase.from("users").select("id, email, membership").eq("referred_by_code", referralCode)).data ?? []) as ReferredUserRow[]
      : [];

    const ids = referredUsersRaw.map((u) => u.id);
    if (ids.length === 0) {
      const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://garmonpay.com").replace(/\/$/, "");
      return NextResponse.json({
        summary,
        referralLink: `${siteOrigin}/register?ref=${referralCode}`,
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
      .select("id, amount, reference_id")
      .eq("user_id", userId)
      .eq("type", "referral_commission")
      .eq("status", "completed");
    const earnedByReferred = new Map<string, number>();
    for (const t of txRows ?? []) {
      const refId = t.reference_id as string | null;
      const referredId = refId ? rcIdToReferred.get(refId) : null;
      if (referredId) {
        earnedByReferred.set(referredId, (earnedByReferred.get(referredId) ?? 0) + Number(t.amount));
      }
    }
    Array.from(bonusByUser.entries()).forEach(([referredId, bonus]) => {
      earnedByReferred.set(referredId, (earnedByReferred.get(referredId) ?? 0) + bonus);
    });

    const referredUsers = referredUsersRaw.map((u) => ({
      referredUserId: u.id,
      email: maskEmail(u.email),
      membership: (tierByUser.get(u.id) ?? u.membership ?? "starter").toString(),
      status: activeByUser.has(u.id) ? "Active" : "Inactive",
      monthlyCommissionCents: monthlyByUser.get(u.id) ?? 0,
      totalEarnedCents: earnedByReferred.get(u.id) ?? 0,
    }));

    const earningsHistory = await getEarningsHistory(supabase, userId);
    const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://garmonpay.com").replace(/\/$/, "");
    const referralLink = referralCode ? `${siteOrigin}/register?ref=${referralCode}` : "";

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
      monthlyReferralIncomeCents: 0,
      lifetimeReferralEarningsCents: 0,
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
    .in("type", ["referral", "referral_commission"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((r: { id: string; type: string; amount: number; status: string; description: string | null; created_at: string }) => ({
    id: r.id,
    type: r.type,
    amountCents: Number(r.amount),
    status: r.status,
    description: r.description ?? (r.type === "referral_commission" ? "Recurring commission" : "Referral bonus"),
    createdAt: r.created_at,
  }));
}
