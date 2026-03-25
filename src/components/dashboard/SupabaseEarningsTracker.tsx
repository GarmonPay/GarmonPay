"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { referralCommissionFromMembershipTier } from "@/lib/garmon-plan-config";

const EARNING_TYPES = new Set([
  "earning",
  "referral",
  "referral_commission",
  "spin_wheel",
  "scratch_card",
  "mystery_box",
  "streak",
  "mission",
  "tournament_prize",
  "team_prize",
]);

function aggregateEarnings(
  rows: { amount: number; type: string; status: string; created_at: string }[]
) {
  const now = Date.now();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const startMonth = new Date(startToday.getFullYear(), startToday.getMonth(), 1).getTime();

  let today = 0;
  let week = 0;
  let month = 0;
  let allTime = 0;
  let pending = 0;

  for (const r of rows) {
    const amt = Number(r.amount);
    const t = new Date(r.created_at).getTime();

    if (r.status === "pending") {
      if (r.type === "withdrawal" || EARNING_TYPES.has(r.type)) pending += amt;
      continue;
    }
    if (r.status !== "completed") continue;

    if (r.type === "withdrawal") continue;

    if (EARNING_TYPES.has(r.type)) {
      allTime += amt;
      if (t >= startToday.getTime()) today += amt;
      if (t >= weekAgo) week += amt;
      if (t >= startMonth) month += amt;
    }
  }

  return { today, week, month, allTime, pending };
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

type Props = {
  userId: string;
  membershipTier: string;
  dashboardReferrals: {
    totalReferrals: number;
    activeReferralSubscriptions: number;
    referralEarningsCents: number;
  };
};

export function SupabaseEarningsTracker({
  userId,
  membershipTier,
  dashboardReferrals,
}: Props) {
  const [sums, setSums] = useState<ReturnType<typeof aggregateEarnings> | null>(null);

  useEffect(() => {
    const sb = createBrowserClient();
    if (!sb) return;

    function load() {
      const c = createBrowserClient();
      if (!c) return;
      void c
        .from("transactions")
        .select("amount, type, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10000)
        .then(({ data, error }) => {
          if (error) {
            console.error("transactions load", error);
            return;
          }
          setSums(aggregateEarnings((data ?? []) as Parameters<typeof aggregateEarnings>[0]));
        });
    }

    load();

    const channel = sb
      .channel(`tx-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [userId]);

  const commissionPct = referralCommissionFromMembershipTier(membershipTier);

  return (
    <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 tablet:gap-5">
      <section className="card-lux p-5 tablet:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">
          Your GarmonPay Earnings
        </h2>
        <p className="mt-1 text-xs text-fintech-muted">
          From Supabase transactions (status completed) — updates live when new activity posts.
        </p>
        {sums ? (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-fintech-muted">Today&apos;s Earnings</dt>
              <dd className="text-xl font-bold text-white">{formatCents(sums.today)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fintech-muted">This Week</dt>
              <dd className="text-xl font-bold text-white">{formatCents(sums.week)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fintech-muted">This Month</dt>
              <dd className="text-xl font-bold text-white">{formatCents(sums.month)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fintech-muted">All Time Total</dt>
              <dd className="text-xl font-bold text-fintech-success">{formatCents(sums.allTime)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-fintech-muted">Pending Balance</dt>
              <dd className="text-xl font-bold text-amber-300">{formatCents(sums.pending)}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-fintech-muted">Loading transaction totals…</p>
        )}
      </section>

      <section className="card-lux p-5 tablet:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-fintech-muted">
          Referral Network
        </h2>
        <dl className="mt-4 space-y-3">
          <div className="flex justify-between gap-4">
            <dt className="text-xs text-fintech-muted">Total referrals</dt>
            <dd className="font-semibold text-white">{dashboardReferrals.totalReferrals}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-xs text-fintech-muted">Active referrals (this month)</dt>
            <dd className="font-semibold text-white">
              {dashboardReferrals.activeReferralSubscriptions}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-xs text-fintech-muted">Total earned from referrals</dt>
            <dd className="font-semibold text-fintech-success">
              {formatCents(dashboardReferrals.referralEarningsCents)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-white/[0.06] pt-3">
            <dt className="text-xs text-fintech-muted">Your commission rate</dt>
            <dd className="font-bold text-[#eab308]">{commissionPct}%</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-fintech-muted">
          Commission reflects your membership tier (see Pricing). Dashboard API refreshes with your
          session; referral totals also sync from the platform.
        </p>
      </section>
    </div>
  );
}
