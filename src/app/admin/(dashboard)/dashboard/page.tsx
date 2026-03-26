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

type AdCampaignSubmission = {
  id: string;
  campaign_type: string;
  content_url: string;
  campaign_goal: string;
  target_audience: string;
  package_selected: string;
  contact_email: string;
  status: "pending" | "approved" | "rejected" | "in_progress" | "completed";
  created_at: string;
};

type SubmissionsApiResponse = {
  submissions?: AdCampaignSubmission[];
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    total_pages?: number;
  };
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
  const [submissions, setSubmissions] = useState<AdCampaignSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [submissionsBusyId, setSubmissionsBusyId] = useState<string | null>(null);
  const [submissionsPage, setSubmissionsPage] = useState(1);
  const [submissionsTotalPages, setSubmissionsTotalPages] = useState(1);
  const [submissionsTotal, setSubmissionsTotal] = useState(0);
  const [submissionsStatusFilter, setSubmissionsStatusFilter] = useState<
    "all" | "pending" | "approved" | "rejected" | "in_progress" | "completed"
  >("all");
  const [submissionsTypeFilter, setSubmissionsTypeFilter] = useState<string>("all");
  const [submissionsSearchInput, setSubmissionsSearchInput] = useState("");
  const [submissionsSearchQuery, setSubmissionsSearchQuery] = useState("");
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [bulkActionStatus, setBulkActionStatus] = useState<
    "approved" | "rejected" | "in_progress" | "completed"
  >("approved");
  const [bulkBusy, setBulkBusy] = useState(false);
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

  function loadSubmissions(page = submissionsPage) {
    if (!session) return;
    setSubmissionsLoading(true);
    setSubmissionsError(null);
    const params = new URLSearchParams();
    params.set("limit", "20");
    params.set("page", String(Math.max(1, page)));
    if (submissionsStatusFilter !== "all") {
      params.set("status", submissionsStatusFilter);
    }
    if (submissionsTypeFilter !== "all") {
      params.set("campaign_type", submissionsTypeFilter);
    }
    if (submissionsSearchQuery.trim()) {
      params.set("q", submissionsSearchQuery.trim());
    }

    fetch(`/api/admin/ad-campaign-submissions?${params.toString()}`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data?.message as string) || "Failed to load submissions");
        const payload = data as SubmissionsApiResponse;
        setSubmissions(Array.isArray(payload.submissions) ? payload.submissions : []);
        setSubmissionsPage(
          typeof payload.pagination?.page === "number" ? payload.pagination.page : Math.max(1, page)
        );
        setSubmissionsTotalPages(
          typeof payload.pagination?.total_pages === "number"
            ? Math.max(1, payload.pagination.total_pages)
            : 1
        );
        setSubmissionsTotal(
          typeof payload.pagination?.total === "number" ? payload.pagination.total : 0
        );
        setSelectedSubmissionIds([]);
      })
      .catch((err) =>
        setSubmissionsError(err instanceof Error ? err.message : "Failed to load submissions")
      )
      .finally(() => setSubmissionsLoading(false));
  }

  useEffect(() => {
    if (!session) return;
    loadSubmissions(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, submissionsStatusFilter, submissionsTypeFilter, submissionsSearchQuery]);

  async function updateSubmissionStatus(
    id: string,
    status: "pending" | "approved" | "rejected" | "in_progress" | "completed"
  ) {
    if (!session) return;
    setSubmissionsBusyId(id);
    setSubmissionsError(null);
    try {
      const res = await fetch("/api/admin/ad-campaign-submissions", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.message as string) || "Failed to update submission");
      loadSubmissions(submissionsPage);
    } catch (err) {
      setSubmissionsError(err instanceof Error ? err.message : "Failed to update submission");
    } finally {
      setSubmissionsBusyId(null);
    }
  }

  async function applyBulkStatus() {
    if (!session || selectedSubmissionIds.length === 0) return;
    setBulkBusy(true);
    setSubmissionsError(null);
    try {
      const res = await fetch("/api/admin/ad-campaign-submissions", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedSubmissionIds, status: bulkActionStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data?.message as string) || "Failed to apply bulk update");
      loadSubmissions(submissionsPage);
    } catch (err) {
      setSubmissionsError(err instanceof Error ? err.message : "Failed to apply bulk update");
    } finally {
      setBulkBusy(false);
    }
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

        <section className="rounded-xl bg-[#111827] border border-white/10 p-5 shadow-lg mt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-[#9ca3af] uppercase tracking-wider">
              Ad Campaign Submissions
            </h2>
            <button
              type="button"
              onClick={() => loadSubmissions()}
              className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-[#9ca3af]">Status</label>
              <select
                value={submissionsStatusFilter}
                onChange={(e) =>
                  setSubmissionsStatusFilter(
                    e.target.value as
                      | "all"
                      | "pending"
                      | "approved"
                      | "rejected"
                      | "in_progress"
                      | "completed"
                  )
                }
                className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#9ca3af]">Campaign type</label>
              <select
                value={submissionsTypeFilter}
                onChange={(e) => setSubmissionsTypeFilter(e.target.value)}
                className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="all">All types</option>
                <option value="YouTube Video Views">YouTube Video Views</option>
                <option value="YouTube Subscribers">YouTube Subscribers</option>
                <option value="TikTok Video Views">TikTok Video Views</option>
                <option value="TikTok Followers">TikTok Followers</option>
                <option value="TikTok Likes">TikTok Likes</option>
                <option value="Instagram Reel Views">Instagram Reel Views</option>
                <option value="Instagram Followers">Instagram Followers</option>
                <option value="Instagram Likes">Instagram Likes</option>
                <option value="Facebook Video Views">Facebook Video Views</option>
                <option value="Facebook Page Likes">Facebook Page Likes</option>
                <option value="Facebook Followers">Facebook Followers</option>
                <option value="GarmonPay General Ad">GarmonPay General Ad</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-[#9ca3af]">Search (email, goal, URL)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={submissionsSearchInput}
                  onChange={(e) => setSubmissionsSearchInput(e.target.value)}
                  className="w-full rounded-md border border-white/20 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  placeholder="Search submissions"
                />
                <button
                  type="button"
                  onClick={() => setSubmissionsSearchQuery(submissionsSearchInput.trim())}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubmissionsSearchInput("");
                    setSubmissionsSearchQuery("");
                  }}
                  className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/20 p-3">
            <span className="text-xs text-[#9ca3af]">
              Selected: <span className="font-semibold text-white">{selectedSubmissionIds.length}</span>
            </span>
            <select
              value={bulkActionStatus}
              onChange={(e) =>
                setBulkActionStatus(
                  e.target.value as "approved" | "rejected" | "in_progress" | "completed"
                )
              }
              className="rounded-md border border-white/20 bg-black/30 px-2.5 py-1.5 text-xs text-white outline-none"
            >
              <option value="approved">Approve</option>
              <option value="in_progress">Set in progress</option>
              <option value="completed">Mark completed</option>
              <option value="rejected">Reject</option>
            </select>
            <button
              type="button"
              disabled={bulkBusy || selectedSubmissionIds.length === 0}
              onClick={applyBulkStatus}
              className="rounded-md bg-[#eab308]/20 px-3 py-1.5 text-xs text-[#fde047] hover:bg-[#eab308]/30 disabled:opacity-40"
            >
              {bulkBusy ? "Applying…" : "Apply to selected"}
            </button>
            <button
              type="button"
              disabled={selectedSubmissionIds.length === 0}
              onClick={() => setSelectedSubmissionIds([])}
              className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-40"
            >
              Clear selection
            </button>
          </div>
          {submissionsError && (
            <div className="mb-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {submissionsError}
            </div>
          )}
          {submissionsLoading ? (
            <p className="text-[#6b7280] text-sm">Loading submissions…</p>
          ) : submissions.length === 0 ? (
            <p className="text-[#6b7280] text-sm">No campaign submissions yet.</p>
          ) : (
            <>
              <div className="mb-3 text-xs text-[#9ca3af]">
                Showing {submissions.length} of {submissionsTotal} submissions
              </div>
              <AdminScrollHint />
              <AdminTableWrap>
                <table className="w-full text-left text-sm min-w-[980px]">
                  <thead>
                    <tr className="border-b border-white/10 text-[#9ca3af]">
                      <th className="pb-3 pr-4 font-medium">
                        <input
                          type="checkbox"
                          aria-label="Select all submissions on page"
                          checked={
                            submissions.length > 0 &&
                            submissions.every((s) => selectedSubmissionIds.includes(s.id))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSubmissionIds(submissions.map((s) => s.id));
                            } else {
                              setSelectedSubmissionIds([]);
                            }
                          }}
                          className="h-4 w-4 rounded border-white/20 bg-black/30"
                        />
                      </th>
                      <th className="pb-3 pr-4 font-medium">Date</th>
                      <th className="pb-3 pr-4 font-medium">Type</th>
                      <th className="pb-3 pr-4 font-medium">Goal</th>
                      <th className="pb-3 pr-4 font-medium">Package</th>
                      <th className="pb-3 pr-4 font-medium">Email</th>
                      <th className="pb-3 pr-4 font-medium">URL</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 pr-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => (
                      <tr key={s.id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 pr-4">
                          <input
                            type="checkbox"
                            aria-label={`Select submission ${s.id}`}
                            checked={selectedSubmissionIds.includes(s.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSubmissionIds((prev) => [...prev, s.id]);
                              } else {
                                setSelectedSubmissionIds((prev) => prev.filter((id) => id !== s.id));
                              }
                            }}
                            className="h-4 w-4 rounded border-white/20 bg-black/30"
                          />
                        </td>
                        <td className="py-3 pr-4 text-[#9ca3af]">
                          {s.created_at ? new Date(s.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="py-3 pr-4 text-white">{s.campaign_type}</td>
                        <td className="py-3 pr-4 text-[#9ca3af]">{s.campaign_goal}</td>
                        <td className="py-3 pr-4 text-[#9ca3af]">{s.package_selected}</td>
                        <td className="py-3 pr-4 text-white">{s.contact_email}</td>
                        <td className="py-3 pr-4">
                          <a
                            href={s.content_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-violet-300 underline underline-offset-2"
                          >
                            Open link
                          </a>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              s.status === "approved"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : s.status === "rejected"
                                  ? "bg-red-500/20 text-red-300"
                                  : s.status === "in_progress"
                                    ? "bg-amber-500/20 text-amber-300"
                                    : s.status === "completed"
                                      ? "bg-blue-500/20 text-blue-300"
                                      : "bg-white/10 text-[#d1d5db]"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={submissionsBusyId === s.id}
                              onClick={() => updateSubmissionStatus(s.id, "approved")}
                              className="rounded-md bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={submissionsBusyId === s.id}
                              onClick={() => updateSubmissionStatus(s.id, "in_progress")}
                              className="rounded-md bg-amber-500/20 px-2.5 py-1 text-xs text-amber-300 hover:bg-amber-500/30 disabled:opacity-50"
                            >
                              In progress
                            </button>
                            <button
                              type="button"
                              disabled={submissionsBusyId === s.id}
                              onClick={() => updateSubmissionStatus(s.id, "rejected")}
                              className="rounded-md bg-red-500/20 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableWrap>
            </>
          )}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-xs text-[#9ca3af]">
              Page {submissionsPage} of {submissionsTotalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submissionsLoading || submissionsPage <= 1}
                onClick={() => loadSubmissions(submissionsPage - 1)}
                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={submissionsLoading || submissionsPage >= submissionsTotalPages}
                onClick={() => loadSubmissions(submissionsPage + 1)}
                className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
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
