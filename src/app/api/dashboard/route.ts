import { NextResponse } from "next/server";
import { findUserById } from "@/lib/auth-store";
import { getEarningsForUser, listAds } from "@/lib/ads-db";
import { getTotalsForUser } from "@/lib/transactions-db";
import { countUserReferrals, getUserReferralEarningsCents } from "@/lib/viral-db";
import {
  getActiveReferralSubscriptionsCount,
  getMonthlyReferralCommissionCents,
  getLifetimeReferralCommissionCents,
} from "@/lib/referral-commissions-db";
import { createServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userIdHeader = request.headers.get("x-user-id");

  if (bearerToken) {
    const supabase = createServerClient(bearerToken);
    if (supabase) {
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) {
          return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }
        const { data: row, error: rowError } = await supabase
          .from("users")
          .select("id, email, role, membership, balance, ad_credit_balance, referral_code")
          .eq("id", authUser.id)
          .single();

        if (rowError) {
          console.error("Dashboard users fetch error:", rowError);
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
          getEarningsForUser(authUser.id),
          getTotalsForUser(authUser.id),
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
      } catch (_) {
        // earnings/transactions/ads tables may be missing
      }
      try {
        totalReferrals = await countUserReferrals(authUser.id);
        referralEarningsCents = await getUserReferralEarningsCents(authUser.id);
      } catch (_) {
        // viral/referral_bonus tables may be missing
      }
      let activeReferralSubscriptions = 0;
      let monthlyReferralCommissionCents = 0;
      let lifetimeReferralCommissionCents = 0;
      try {
        [activeReferralSubscriptions, monthlyReferralCommissionCents, lifetimeReferralCommissionCents] = await Promise.all([
          getActiveReferralSubscriptionsCount(authUser.id),
          getMonthlyReferralCommissionCents(authUser.id),
          getLifetimeReferralCommissionCents(authUser.id),
        ]);
      } catch (_) {
        // referral_commissions / subscriptions tables may be missing
      }

      const userRow = row as { balance?: number; ad_credit_balance?: number; membership?: string; referral_code?: string } | null;
      const balanceCents = Number(userRow?.balance ?? 0);
      const adCreditBalanceCents = Number(userRow?.ad_credit_balance ?? 0);

        return NextResponse.json({
          earningsTodayCents,
          earningsWeekCents,
          earningsMonthCents,
          balanceCents,
          adCreditBalanceCents,
          withdrawableCents: balanceCents,
          totalEarningsCents,
          totalWithdrawnCents,
          membershipTier: userRow?.membership ?? "starter",
          referralCode: userRow?.referral_code ?? "",
          referralEarningsCents,
          totalReferrals,
          activeReferralSubscriptions,
          monthlyReferralCommissionCents,
          lifetimeReferralCommissionCents,
          announcements: [],
          availableAds,
        });
      } catch (err) {
        console.error("Supabase connection failed", err);
        return NextResponse.json(
          {
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
          },
          { status: 200 }
        );
      }
    }
  }

  if (userIdHeader) {
    const user = findUserById(userIdHeader);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      earningsTodayCents: 0,
      earningsWeekCents: 0,
      earningsMonthCents: 0,
      balanceCents: 0,
      withdrawableCents: 0,
      membershipTier: "starter",
      referralCode: user.referralCode,
      referralEarningsCents: 0,
      totalReferrals: 0,
      announcements: [],
      availableAds: [],
    });
  }

  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}
