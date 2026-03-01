import { NextResponse } from "next/server";
import { getEarningsForUser, listAds } from "@/lib/ads-db";
import { getTotalsForUser } from "@/lib/transactions-db";
import { countUserReferrals, getUserReferralEarningsCents } from "@/lib/viral-db";
import {
  getActiveReferralSubscriptionsCount,
  getMonthlyReferralCommissionCents,
  getLifetimeReferralCommissionCents,
} from "@/lib/referral-commissions-db";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const safeDashboardPayload: {
    earningsTodayCents: 0,
    earningsWeekCents: 0,
    earningsMonthCents: 0,
    balanceCents: 0,
    adCreditBalanceCents: 0,
    withdrawableCents: 0,
    totalEarningsCents: 0,
    totalWithdrawnCents: 0,
    membershipTier: "starter",
    referralCode: "",
    referralEarningsCents: 0,
    totalReferrals: 0,
    activeReferralSubscriptions: 0,
    monthlyReferralCommissionCents: 0,
    lifetimeReferralCommissionCents: 0,
    announcements: { id: string; title: string; body: string; publishedAt: string }[],
    availableAds: { id: string; title: string; rewardCents: number }[],
  } = {
    earningsTodayCents: 0,
    earningsWeekCents: 0,
    earningsMonthCents: 0,
    balanceCents: 0,
    adCreditBalanceCents: 0,
    withdrawableCents: 0,
    totalEarningsCents: 0,
    totalWithdrawnCents: 0,
    membershipTier: "starter",
    referralCode: "",
    referralEarningsCents: 0,
    totalReferrals: 0,
    activeReferralSubscriptions: 0,
    monthlyReferralCommissionCents: 0,
    lifetimeReferralCommissionCents: 0,
    announcements: [],
    availableAds: [],
  };

  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: row, error: rowError } = await supabase
    .from("users")
    .select("id, email, role, membership, balance, ad_credit_balance, withdrawable_balance, referral_code")
    .eq("id", userId)
    .maybeSingle();

  if (rowError) {
    console.error("Dashboard users fetch error:", rowError);
    return NextResponse.json({ message: rowError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ message: "Profile not found" }, { status: 404 });
  }

  let earningsTodayCents = 0;
  let earningsWeekCents = 0;
  let earningsMonthCents = 0;
  let totalEarningsCents = 0;
  let totalWithdrawnCents = 0;
  let totalReferrals = 0;
  let referralEarningsCents = 0;
  let availableAds: { id: string; title: string; rewardCents: number }[] = [];

  try {
    const [earnings, totals, ads] = await Promise.all([
      getEarningsForUser(userId),
      getTotalsForUser(userId),
      listAds(),
    ]);
    earningsTodayCents = earnings.todayCents;
    earningsWeekCents = earnings.weekCents;
    earningsMonthCents = earnings.monthCents;
    totalEarningsCents = totals.totalEarningsCents;
    totalWithdrawnCents = totals.totalWithdrawnCents;
    availableAds = ads.map((a) => ({
      id: a.id,
      title: a.title,
      rewardCents: Number(a.user_reward),
    }));
  } catch {
    // Non-critical tables may be missing in partially migrated environments.
  }

  try {
    totalReferrals = await countUserReferrals(userId);
    referralEarningsCents = await getUserReferralEarningsCents(userId);
  } catch {
    // Optional referrals modules may be disabled.
  }

  let activeReferralSubscriptions = 0;
  let monthlyReferralCommissionCents = 0;
  let lifetimeReferralCommissionCents = 0;
  try {
    [activeReferralSubscriptions, monthlyReferralCommissionCents, lifetimeReferralCommissionCents] = await Promise.all([
      getActiveReferralSubscriptionsCount(userId),
      getMonthlyReferralCommissionCents(userId),
      getLifetimeReferralCommissionCents(userId),
    ]);
  } catch {
    // Optional referral commission tables may be missing.
  }

  const userRow = row as {
    balance?: number;
    ad_credit_balance?: number;
    withdrawable_balance?: number;
    membership?: string;
    referral_code?: string;
  } | null;

  return NextResponse.json({
    ...safeDashboardPayload,
    earningsTodayCents,
    earningsWeekCents,
    earningsMonthCents,
    balanceCents: Number(userRow?.balance ?? 0),
    adCreditBalanceCents: Number(userRow?.ad_credit_balance ?? 0),
    withdrawableCents: Number(userRow?.withdrawable_balance ?? userRow?.balance ?? 0),
    totalEarningsCents,
    totalWithdrawnCents,
    membershipTier: userRow?.membership ?? "starter",
    referralCode: userRow?.referral_code ?? "",
    referralEarningsCents,
    totalReferrals,
    activeReferralSubscriptions,
    monthlyReferralCommissionCents,
    lifetimeReferralCommissionCents,
    availableAds,
  });
}
