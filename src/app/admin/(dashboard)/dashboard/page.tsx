"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";

const defaultStats = {
  totalUsers: 0,
  totalDeposits: 0,
  totalWithdrawals: 0,
  totalBalance: 0,
  totalProfit: 0,
  totalRevenue: 0,
  recentTransactions: [] as { id: string; type: string; amount: number; status: string; description: string | null; created_at: string; user_email?: string }[],
  recentPayments: [] as { id: string; user_id: string; email: string; amount: number; currency: string; status: string; stripe_session_id: string | null; created_at: string }[],
};

type PlatformMetrics = {
  platformRevenueTodayCents: number;
  platformRevenueMonthCents: number;
  paidOutWithdrawalsTodayCents: number;
  paidOutWithdrawalsMonthCents: number;
  earningsCreditedTodayCents: number;
  earningsCreditedMonthCents: number;
  profitTodayCents: number;
  profitMonthCents: number;
  membershipCounts: Record<string, number>;
  totalUsers: number;
};

type ProfitMonitorPayload = {
  advertiser_revenue_today: number;
  advertiser_revenue_month: number;
  member_payouts_today: number;
  member_payouts_month: number;
  deferred_payouts_today: number;
  profit_today: number;
  profit_month: number;
  profit_margin_today: number;
  profit_margin_month: number;
  daily_payout_cap: number;
  daily_payout_used: number;
  daily_payout_remaining: number;
  is_at_risk: boolean;
  plan_breakdown: Array<{ plan: string; member_count: number; total_earned_today: number }>;
};

type StatsApiResponse = {
  totalUsers?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
  totalBalance?: number;
  totalProfit?: number;
  totalRevenue?: number;
  recentTransactions?: typeof defaultStats.recentTransactions;
  recentPayments?: typeof defaultStats.recentPayments;
};

export default function Dashboard() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getAdminSessionAsync>>>(null);
  const [stats, setStats] = useState(defaultStats);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics | null>(null);
  const [profitMonitor, setProfitMonitor] = useState<ProfitMonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const applyStats = (data: StatsApiResponse) => {
    setStats((prev) => ({
      ...prev,
      totalUsers: data.totalUsers ?? 0,
      totalDeposits: data.totalDeposits ?? 0,
      totalWithdrawals: data.totalWithdrawals ?? 0,
      totalBalance: data.totalBalance ?? 0,
      totalProfit: data.totalProfit ?? 0,
      totalRevenue: data.totalRevenue ?? 0,
      recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
      recentPayments: Array.isArray(data.recentPayments) ? data.recentPayments : prev.recentPayments,
    }));
  };

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    setStatsError(null);
    fetch("/api/admin/stats", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 503 ? "Server configuration error. Ensure SUPABASE_SERVICE_ROLE_KEY is set in Vercel." : `Stats failed (${res.status}).`);
        return res.json();
      })
      .then((data: StatsApiResponse) => applyStats(data))
      .catch((err) => setStatsError(err instanceof Error ? err.message : "Failed to load stats"))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/admin/stripe-payments", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { payments: [] }))
      .then((data) => setStats((prev) => ({ ...prev, recentPayments: data.payments ?? [] })))
      .catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/admin/platform-metrics", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PlatformMetrics | null) => {
        if (data) setPlatformMetrics(data);
      })
      .catch(() => setPlatformMetrics(null));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const loadProfit = () => {
      fetch("/api/admin/profit-monitor", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: ProfitMonitorPayload | null) => {
          if (!cancelled) setProfitMonitor(data);
        })
        .catch(() => {
          if (!cancelled) setProfitMonitor(null);
        });
    };

    loadProfit();
    const timer = setInterval(loadProfit, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session]);

  function load() {
    if (!session) return;
    setLoading(true);
    setStatsError(null);
    fetch("/api/admin/stats", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 503 ? "Server configuration error." : `Stats failed (${res.status}).`);
        return res.json();
      })
      .then((data: StatsApiResponse) => applyStats(data))
      .catch((err) => setStatsError(err instanceof Error ? err.message : "Failed to load stats"))
      .finally(() => setLoading(false));
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-[#9ca3af]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <header className="shrink-0 border-b border-white/10 bg-[#0f172a]/80 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Admin Dashboard</h1>
            <p className="text-sm text-[#9ca3af] mt-0.5">Overview of platform stats and recent activity</p>
          </div>
        </div>
      </header>
      <div className="py-6 flex-1">
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-200/90 text-sm">
          Fight server is on free tier. Upgrade to Render Starter ($7/month) to eliminate cold start delays and improve fight performance.
        </div>
        {statsError && (
          <div className="mb-6 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm flex items-center justify-between gap-4">
            <span>{statsError}</span>
            <button type="button" onClick={load} className="shrink-0 px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium">
              Retry
            </button>
          </div>
        )}

        <section className="mb-8 rounded-xl border border-violet-400/20 bg-[#0f172a]/90 p-5 shadow-lg">
          <h2 className="text-sm font-semibold text-[#eab308] uppercase tracking-wider mb-4">
            Profit Monitor
          </h2>
          {!profitMonitor ? (
            <p className="text-[#9ca3af] text-sm">Loading profit monitor…</p>
          ) : (
            <>
              {profitMonitor.profit_margin_today > 70 ? (
                <div className="mb-5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-emerald-300 text-sm font-medium">
                  Platform Healthy — Profit margin is above target.
                </div>
              ) : profitMonitor.profit_margin_today >= 60 ? (
                <div className="mb-5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-amber-300 text-sm font-medium">
                  Monitor Closely — Profit margin is approaching minimum threshold.
                </div>
              ) : (
                <div className="mb-5 rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-3 text-red-300 text-sm font-semibold animate-pulse">
                  ALERT — Profit margin below 60 percent. Review advertiser revenue and consider pausing
                  new member earning actions.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
                <MetricCard
                  label="Advertiser Revenue Today"
                  value={`$${(profitMonitor.advertiser_revenue_today / 100).toFixed(2)}`}
                  valueClass="text-[#fde047]"
                />
                <MetricCard
                  label="Member Payouts Today"
                  value={`$${(profitMonitor.member_payouts_today / 100).toFixed(2)}`}
                  valueClass="text-violet-300"
                />
                <MetricCard
                  label="Platform Profit Today"
                  value={`$${(profitMonitor.profit_today / 100).toFixed(2)}`}
                  valueClass="text-white"
                />
                <MetricCard
                  label="Profit Margin Today"
                  value={`${profitMonitor.profit_margin_today.toFixed(2)}%`}
                  valueClass={
                    profitMonitor.profit_margin_today > 70
                      ? "text-emerald-400"
                      : profitMonitor.profit_margin_today >= 60
                        ? "text-amber-400"
                        : "text-red-400"
                  }
                />
                <MetricCard
                  label="Daily Payout Cap Remaining"
                  value={`$${(profitMonitor.daily_payout_remaining / 100).toFixed(2)}`}
                  valueClass="text-[#eab308]"
                />
                <MetricCard
                  label="Deferred Payouts"
                  value={String(profitMonitor.deferred_payouts_today)}
                  valueClass="text-red-300"
                />
              </div>

              <div className="rounded-lg border border-white/10 bg-[#111827] p-4">
                <p className="text-xs font-medium text-[#9ca3af] uppercase tracking-wider mb-3">
                  Revenue vs Payout Ratio (Today)
                </p>
                <div className="space-y-3">
                  <BarRow
                    label="Revenue"
                    value={profitMonitor.advertiser_revenue_today}
                    max={Math.max(
                      1,
                      profitMonitor.advertiser_revenue_today,
                      profitMonitor.member_payouts_today
                    )}
                    barClass="bg-[#eab308]"
                    textClass="text-[#fde047]"
                  />
                  <BarRow
                    label="Payouts"
                    value={profitMonitor.member_payouts_today}
                    max={Math.max(
                      1,
                      profitMonitor.advertiser_revenue_today,
                      profitMonitor.member_payouts_today
                    )}
                    barClass="bg-violet-500"
                    textClass="text-violet-300"
                  />
                </div>
              </div>
            </>
          )}
        </section>

        <section className="mb-10 rounded-xl border border-[#eab308]/25 bg-[#0f172a]/90 p-5 shadow-lg">
          <h2 className="text-sm font-semibold text-[#eab308] uppercase tracking-wider mb-4">
            Platform Earnings Tracker
          </h2>
          <p className="text-xs text-[#9ca3af] mb-4">
            Derived from Supabase <code className="text-[#a78bfa]">transactions</code> (deposits =
            revenue, completed withdrawals = paid out to members) and{" "}
            <code className="text-[#a78bfa]">users.membership</code> for plan counts.
          </p>
          {platformMetrics ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
                <div className="rounded-lg bg-[#111827] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Platform revenue today</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">
                    ${(platformMetrics.platformRevenueTodayCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-[#111827] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Platform revenue this month</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">
                    ${(platformMetrics.platformRevenueMonthCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-[#111827] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Paid out to members today</p>
                  <p className="text-xl font-bold text-amber-300 mt-1">
                    ${(platformMetrics.paidOutWithdrawalsTodayCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-[#111827] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Paid out to members this month</p>
                  <p className="text-xl font-bold text-amber-300 mt-1">
                    ${(platformMetrics.paidOutWithdrawalsMonthCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-[#111827] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Platform profit today</p>
                  <p className="text-xl font-bold text-white mt-1">
                    ${(platformMetrics.profitTodayCents / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-[#6b7280] mt-1">Revenue today − withdrawals completed today</p>
                </div>
                <div className="rounded-lg bg-[#111827] border border-white/10 p-4">
                  <p className="text-xs text-[#9ca3af] uppercase">Earnings credited (month)</p>
                  <p className="text-xl font-bold text-violet-300 mt-1">
                    ${(platformMetrics.earningsCreditedMonthCents / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-[#6b7280] mt-1">Member earning types completed</p>
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#111827] p-4">
                <p className="text-xs font-medium text-[#9ca3af] uppercase tracking-wider mb-3">
                  Active members by plan (DB membership)
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 text-sm">
                  {[
                    { key: "starter", label: "Free / Starter" },
                    { key: "pro", label: "Growth / Pro" },
                    { key: "elite", label: "Pro / Elite" },
                    { key: "vip", label: "Elite (VIP)" },
                    { key: "active", label: "Active" },
                  ].map(({ key, label }) => (
                    <div key={key} className="rounded-md bg-black/30 px-3 py-2 border border-white/5">
                      <p className="text-[#9ca3af] text-xs">{label}</p>
                      <p className="text-lg font-bold text-white">
                        {platformMetrics.membershipCounts[key] ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[#6b7280] mt-3">
                  Marketing names (Free, Starter, Growth, Pro, Elite) map to database{" "}
                  <code className="text-[#a78bfa]">users.membership</code> values; adjust tiers in
                  Stripe/webhooks to match five SKUs over time.
                </p>
              </div>
            </>
          ) : (
            <p className="text-[#6b7280] text-sm">Loading platform metrics…</p>
          )}
        </section>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <div className="rounded-xl bg-[#111827] border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Total Users</h2>
            <p className="text-2xl font-bold text-white mt-2">{stats.totalUsers}</p>
          </div>
          <div className="rounded-xl bg-[#111827] border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Total Deposits</h2>
            <p className="text-2xl font-bold text-[#10b981] mt-2">
              ${(stats.totalDeposits / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-[#111827] border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Total Withdrawals</h2>
            <p className="text-2xl font-bold text-amber-400 mt-2">
              ${(stats.totalWithdrawals / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-[#111827] border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-[#9ca3af] uppercase tracking-wider">User Balances (total)</h2>
            <p className="text-2xl font-bold text-white mt-2">
              ${(stats.totalBalance / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-[#111827] border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Total Profit</h2>
            <p className="text-2xl font-bold text-[#10b981] mt-2">
              ${(Number(stats.totalProfit) / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-[#111827] border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-[#9ca3af] uppercase tracking-wider">Total Revenue</h2>
            <p className="text-2xl font-bold text-white mt-2">
              ${(Number(stats.totalRevenue) / 100).toFixed(2)}
            </p>
          </div>
        </div>

        <section className="rounded-xl bg-[#111827] border border-white/10 p-5 shadow-lg">
          <h2 className="text-sm font-medium text-[#9ca3af] uppercase tracking-wider mb-4">Recent Transactions</h2>
          {stats.recentTransactions.length === 0 ? (
            <p className="text-[#6b7280] text-sm">No transactions yet.</p>
          ) : (
            <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-white/10 text-[#9ca3af]">
                    <th className="pb-3 pr-4 font-medium">Date</th>
                    <th className="pb-3 pr-4 font-medium">User</th>
                    <th className="pb-3 pr-4 font-medium">Type</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentTransactions.slice(0, 20).map((tx) => (
                    <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 pr-4 text-[#9ca3af]">
                        {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 pr-4 text-white truncate max-w-[180px]">{tx.user_email ?? tx.id ?? "—"}</td>
                      <td className="py-3 pr-4 text-[#9ca3af] capitalize">{tx.type}</td>
                      <td className="py-3 pr-4 text-[#9ca3af] capitalize">{tx.status}</td>
                      <td className="py-3 pr-4 text-right font-medium text-white">
                        ${(Number(tx.amount) / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
            </>
          )}
        </section>
        <section className="rounded-xl bg-[#111827] border border-white/10 p-5 shadow-lg mt-6">
          <h2 className="text-sm font-medium text-[#9ca3af] uppercase tracking-wider mb-4">Stripe payment logs</h2>
          {stats.recentPayments.length === 0 ? (
            <p className="text-[#6b7280] text-sm">No Stripe payments yet.</p>
          ) : (
            <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-white/10 text-[#9ca3af]">
                    <th className="pb-3 pr-4 font-medium">Date</th>
                    <th className="pb-3 pr-4 font-medium">Email</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentPayments.slice(0, 20).map((p) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 pr-4 text-[#9ca3af]">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 pr-4 text-white truncate max-w-[200px]">{p.email ?? "—"}</td>
                      <td className="py-3 pr-4 text-[#9ca3af] capitalize">{p.status}</td>
                      <td className="py-3 pr-4 text-right font-medium text-white">
                        ${Number(p.amount).toFixed(2)} {p.currency?.toUpperCase() ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-[#111827] border border-white/10 p-4">
      <p className="text-xs text-[#9ca3af] uppercase">{label}</p>
      <p className={`text-xl font-bold mt-1 ${valueClass ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  barClass,
  textClass,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
  textClass: string;
}) {
  const widthPct = Math.max(2, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={textClass}>{label}</span>
        <span className="text-[#9ca3af]">${(value / 100).toFixed(2)}</span>
      </div>
      <div className="h-3 w-full rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full ${barClass}`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
