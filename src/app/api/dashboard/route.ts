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
import { createAdminClient, createServerClient } from "@/lib/supabase";
import { normalizeUserMembershipTier } from "@/lib/garmon-plan-config";
import { resolveProfileBalanceCents } from "@/lib/profile-balance";
import { computeTaxInfoRequired } from "@/lib/reportable-earnings";
import { IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS } from "@/lib/signup-compliance";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userIdHeader = request.headers.get("x-user-id");

  const safeDashboardPayload = {
    earningsTodayCents: 0,
    earningsWeekCents: 0,
    earningsMonthCents: 0,
    balanceCents: null as number | null,
    balanceError: "Unable to load dashboard" as string | null,
    adCreditBalanceCents: 0,
    withdrawableCents: null as number | null,
    totalEarningsCents: 0,
    totalWithdrawnCents: 0,
    totalDepositsCents: 0,
    membershipTier: "free",
    membershipTierDb: "",
    membershipExpiresAt: null as string | null,
    membershipPaymentSource: null as string | null,
    stripeSubscriptionId: null as string | null,
    referralCode: "",
    referralEarningsCents: 0,
    totalReferrals: 0,
    activeReferralSubscriptions: 0,
    monthlyReferralCommissionCents: 0,
    lifetimeReferralCommissionCents: 0,
    announcements: [] as { id: string; title: string; body: string; publishedAt: string }[],
    availableAds: [] as { id: string; title: string; rewardCents: number }[],
    reportableEarningsCents: 0,
    taxInfoSubmittedAt: null as string | null,
    taxInfoRequired: false,
    irsReportableThresholdCents: IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS,
  };

  if (bearerToken) {
    const supabase = createServerClient(bearerToken);
    if (!supabase) {
      return NextResponse.json(safeDashboardPayload, { status: 200 });
    }
    {
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) {
          return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }
        let balanceCents: number | null = null;
        let balanceError: string | null = null;
        {
          const r1 = await supabase
            .from("profiles")
            .select("balance, balance_cents")
            .eq("id", authUser.id)
            .maybeSingle();
          const missingCol =
            r1.error &&
            (/balance_cents|column .* does not exist/i.test(r1.error.message ?? "") ||
              (r1.error as { code?: string }).code === "42703");
          const r2 = missingCol
            ? await supabase.from("profiles").select("balance").eq("id", authUser.id).maybeSingle()
            : null;
          const profileRow = missingCol && r2 ? r2.data : r1.data;
          const profileErr = missingCol && r2 ? r2.error : r1.error;

          if (profileErr) {
            console.error("Dashboard profiles fetch error:", profileErr);
            balanceError = profileErr.message;
          } else {
            const resolved = resolveProfileBalanceCents(profileRow);
            if (resolved.ok) {
              balanceCents = resolved.cents;
            } else {
              balanceError = resolved.message;
            }
          }
        }

        const { data: row, error: rowError } = await supabase
          .from("users")
          .select(
            "id, email, role, membership, membership_expires_at, membership_payment_source, stripe_subscription_id, balance, ad_credit_balance, withdrawable_balance, referral_code"
          )
          .eq("id", authUser.id)
          .maybeSingle();

        if (rowError) {
          console.error("Dashboard users fetch error:", rowError);
        }

        let reportableEarningsCents = 0;
        let taxInfoSubmittedAt: string | null = null;
        {
          const tr = await supabase
            .from("profiles")
            .select("reportable_earnings_cents, tax_info_submitted_at")
            .eq("id", authUser.id)
            .maybeSingle();
          const colMissing =
            tr.error &&
            (/does not exist/i.test(tr.error.message ?? "") || (tr.error as { code?: string }).code === "42703");
          if (!colMissing && tr.data) {
            reportableEarningsCents = Number(
              (tr.data as { reportable_earnings_cents?: number }).reportable_earnings_cents ?? 0,
            );
            const ts = (tr.data as { tax_info_submitted_at?: string | null }).tax_info_submitted_at;
            taxInfoSubmittedAt = typeof ts === "string" && ts.length > 0 ? ts : null;
          }
        }
        const taxInfoRequired = computeTaxInfoRequired(reportableEarningsCents, taxInfoSubmittedAt);

        let earningsTodayCents = 0;
      let earningsWeekCents = 0;
      let earningsMonthCents = 0;
      let totalEarningsCents = 0;
      let totalWithdrawnCents = 0;
      let totalDepositsCents = 0;
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
        totalDepositsCents = totals.totalDepositsCents;
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

      const userRow = row as {
        balance?: number | null;
        ad_credit_balance?: number;
        withdrawable_balance?: number;
        membership?: string;
        membership_expires_at?: string | null;
        membership_payment_source?: string | null;
        stripe_subscription_id?: string | null;
        referral_code?: string;
      } | null;
      const membershipRaw = userRow?.membership ?? "";
      const adCreditBalanceCents = Number(userRow?.ad_credit_balance ?? 0);
      const withdrawableCents =
        balanceCents !== null ? balanceCents : null;

        return NextResponse.json({
          earningsTodayCents,
          earningsWeekCents,
          earningsMonthCents,
          balanceCents,
          balanceError,
          adCreditBalanceCents,
          withdrawableCents,
          totalEarningsCents,
          totalWithdrawnCents,
          totalDepositsCents,
          membershipTier: normalizeUserMembershipTier(membershipRaw),
          membershipTierDb: membershipRaw,
          membershipExpiresAt: userRow?.membership_expires_at ?? null,
          membershipPaymentSource: userRow?.membership_payment_source ?? null,
          stripeSubscriptionId: userRow?.stripe_subscription_id ?? null,
          referralCode: userRow?.referral_code ?? "",
          referralEarningsCents,
          totalReferrals,
          activeReferralSubscriptions,
          monthlyReferralCommissionCents,
          lifetimeReferralCommissionCents,
          announcements: [],
          availableAds,
          reportableEarningsCents,
          taxInfoSubmittedAt,
          taxInfoRequired,
          irsReportableThresholdCents: IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS,
        });
      } catch (err) {
        console.error("Supabase connection failed", err);
        return NextResponse.json(safeDashboardPayload, { status: 200 });
      }
    }
  }

  if (userIdHeader) {
    const user = findUserById(userIdHeader);
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const admin = createAdminClient();
    let balanceCents: number | null = null;
    let balanceError: string | null = null;
    if (admin) {
      const r1 = await admin.from("profiles").select("balance, balance_cents").eq("id", userIdHeader).maybeSingle();
      const missingCol =
        r1.error &&
        (/balance_cents|column .* does not exist/i.test(r1.error.message ?? "") ||
          (r1.error as { code?: string }).code === "42703");
      const r2 = missingCol
        ? await admin.from("profiles").select("balance").eq("id", userIdHeader).maybeSingle()
        : null;
      const prof = missingCol && r2 ? r2.data : r1.data;
      const pe = missingCol && r2 ? r2.error : r1.error;
      if (pe) {
        balanceError = pe.message;
      } else {
        const resolved = resolveProfileBalanceCents(prof);
        if (resolved.ok) balanceCents = resolved.cents;
        else balanceError = resolved.message;
      }
    } else {
      balanceError = "Balance unavailable (server configuration)";
    }
    return NextResponse.json({
      earningsTodayCents: 0,
      earningsWeekCents: 0,
      earningsMonthCents: 0,
      balanceCents,
      balanceError,
      adCreditBalanceCents: 0,
      withdrawableCents: balanceCents,
      totalEarningsCents: 0,
      totalWithdrawnCents: 0,
      totalDepositsCents: 0,
      membershipTier: "free",
      membershipTierDb: "",
      membershipExpiresAt: null,
      membershipPaymentSource: null,
      stripeSubscriptionId: null,
      referralCode: user.referralCode,
      referralEarningsCents: 0,
      totalReferrals: 0,
      activeReferralSubscriptions: 0,
      monthlyReferralCommissionCents: 0,
      lifetimeReferralCommissionCents: 0,
      announcements: [],
      availableAds: [],
      reportableEarningsCents: 0,
      taxInfoSubmittedAt: null,
      taxInfoRequired: false,
      irsReportableThresholdCents: IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS,
    });
  }

  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}
