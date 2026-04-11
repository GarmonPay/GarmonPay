"use client";

import { useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";

const API_BASE = getApiRoot();

type GameRevenuePayload = {
  today: { total: number; celo: number; coinflip: number; ads: number; memberships: number };
  thisWeek: { total: number; breakdown: Record<string, number> };
  thisMonth: { total: number; breakdown: Record<string, number> };
  allTime: { total: number; breakdown: Record<string, number> };
  recentTransactions: Array<{
    id: string;
    source: string;
    amount_cents: number;
    description: string | null;
    created_at: string;
  }>;
  celoActivity?: {
    recentRounds: Array<{
      id: string;
      shortId: string;
      status: string;
      prize_pool_sc: number | null;
      platform_fee_sc: number | null;
      created_at: string | null;
      completed_at: string | null;
    }>;
    roundsCompletedToday: number;
    playerRollsToday: number;
    avgPotCentsToday: number;
  };
};

function RevenueCard({
  title,
  amountCents,
  color,
}: {
  title: string;
  amountCents: number;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "rgba(13,5,32,0.8)",
        border: `1px solid ${color}40`,
        borderRadius: 12,
      }}
    >
      <div
        className="text-[12px] mb-2 uppercase tracking-wider"
        style={{ color: "#888" }}
      >
        {title}
      </div>
      <div className="text-[28px] font-bold" style={{ color }}>
        ${(amountCents / 100).toFixed(2)}
      </div>
    </div>
  );
}

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

type CoinFlipAdminStats = {
  totalFlipsToday: number;
  totalHouseCutTodayMinor: number;
  totalWageredTodayMinor: number;
};

export default function Dashboard() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [stats, setStats] = useState(defaultStats);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics | null>(null);
  const [coinFlipStats, setCoinFlipStats] = useState<CoinFlipAdminStats | null>(null);
  const [gameRevenue, setGameRevenue] = useState<GameRevenuePayload | null>(null);
  const [gameRevenueError, setGameRevenueError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

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
      .then((data) => {
        setStats({
          totalUsers: data.totalUsers ?? 0,
          totalDeposits: data.totalDeposits ?? 0,
          totalWithdrawals: data.totalWithdrawals ?? 0,
          totalBalance: data.totalBalance ?? 0,
          totalProfit: data.totalProfit ?? 0,
          totalRevenue: data.totalRevenue ?? 0,
          recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
          recentPayments: Array.isArray(data.recentPayments) ? data.recentPayments : [],
        });
      })
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
    fetch("/api/admin/coin-flip/stats", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CoinFlipAdminStats | null) => {
        if (data && typeof data.totalFlipsToday === "number") setCoinFlipStats(data);
        else setCoinFlipStats(null);
      })
      .catch(() => setCoinFlipStats(null));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setGameRevenueError(null);
    fetch(`${API_BASE}/admin/revenue`, {
      credentials: "include",
      headers: adminApiHeaders(session),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Revenue ${res.status}`);
        return res.json();
      })
      .then((data: GameRevenuePayload & { message?: string }) => {
        setGameRevenue({
          today: data.today ?? {
            total: 0,
            celo: 0,
            coinflip: 0,
            ads: 0,
            memberships: 0,
          },
          thisWeek: data.thisWeek ?? { total: 0, breakdown: {} },
          thisMonth: data.thisMonth ?? { total: 0, breakdown: {} },
          allTime: data.allTime ?? { total: 0, breakdown: {} },
          recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
          celoActivity: data.celoActivity,
        });
      })
      .catch((e) => {
        setGameRevenue(null);
        setGameRevenueError(e instanceof Error ? e.message : "Failed to load game revenue");
      });
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
      .then((data) => {
        setStats((prev) => ({
          ...prev,
          totalUsers: data.totalUsers ?? 0,
          totalDeposits: data.totalDeposits ?? 0,
          totalWithdrawals: data.totalWithdrawals ?? 0,
          totalBalance: data.totalBalance ?? 0,
          totalProfit: data.totalProfit ?? 0,
          totalRevenue: data.totalRevenue ?? 0,
          recentTransactions: Array.isArray(data.recentTransactions) ? data.recentTransactions : [],
        }));
      })
      .catch((err) => setStatsError(err instanceof Error ? err.message : "Failed to load stats"))
      .finally(() => setLoading(false));
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-fintech-muted">
        Redirecting to admin login…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-fintech-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <header className="shrink-0 border-b border-white/10 bg-fintech-bg-card/80 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Admin Dashboard</h1>
            <p className="text-sm text-fintech-muted mt-0.5">Overview of platform stats and recent activity</p>
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

        <section className="mb-10 rounded-xl border border-fintech-highlight/25 bg-fintech-bg-card/90 p-5 shadow-lg">
          <h2 className="text-sm font-semibold text-fintech-highlight uppercase tracking-wider mb-4">
            Platform Earnings Tracker
          </h2>
          <p className="text-xs text-fintech-muted mb-4">
            Derived from Supabase <code className="text-fintech-muted">transactions</code> (deposits =
            revenue, completed withdrawals = paid out to members) and{" "}
            <code className="text-fintech-muted">users.membership</code> for plan counts.
          </p>
          {platformMetrics ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
                <div className="rounded-lg bg-fintech-bg-card border border-white/10 p-4">
                  <p className="text-xs text-fintech-muted uppercase">Platform revenue today</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">
                    ${(platformMetrics.platformRevenueTodayCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-fintech-bg-card border border-white/10 p-4">
                  <p className="text-xs text-fintech-muted uppercase">Platform revenue this month</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">
                    ${(platformMetrics.platformRevenueMonthCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-fintech-bg-card border border-white/10 p-4">
                  <p className="text-xs text-fintech-muted uppercase">Paid out to members today</p>
                  <p className="text-xl font-bold text-amber-300 mt-1">
                    ${(platformMetrics.paidOutWithdrawalsTodayCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-fintech-bg-card border border-white/10 p-4">
                  <p className="text-xs text-fintech-muted uppercase">Paid out to members this month</p>
                  <p className="text-xl font-bold text-amber-300 mt-1">
                    ${(platformMetrics.paidOutWithdrawalsMonthCents / 100).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-fintech-bg-card border border-white/10 p-4">
                  <p className="text-xs text-fintech-muted uppercase">Platform profit today</p>
                  <p className="text-xl font-bold text-white mt-1">
                    ${(platformMetrics.profitTodayCents / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-fintech-muted mt-1">Revenue today − withdrawals completed today</p>
                </div>
                <div className="rounded-lg bg-fintech-bg-card border border-white/10 p-4">
                  <p className="text-xs text-fintech-muted uppercase">Earnings credited (month)</p>
                  <p className="text-xl font-bold text-violet-300 mt-1">
                    ${(platformMetrics.earningsCreditedMonthCents / 100).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-fintech-muted mt-1">Member earning types completed</p>
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-fintech-bg-card p-4">
                <p className="text-xs font-medium text-fintech-muted uppercase tracking-wider mb-3">
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
                      <p className="text-fintech-muted text-xs">{label}</p>
                      <p className="text-lg font-bold text-white">
                        {platformMetrics.membershipCounts[key] ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-fintech-muted mt-3">
                  Marketing names (Free, Starter, Growth, Pro, Elite) map to database{" "}
                  <code className="text-fintech-muted">users.membership</code> values; adjust tiers in
                  Stripe/webhooks to match five SKUs over time.
                </p>
              </div>
            </>
          ) : (
            <p className="text-fintech-muted text-sm">Loading platform metrics…</p>
          )}
        </section>

        <section className="mb-10 rounded-xl border border-emerald-500/25 bg-fintech-bg-card/90 p-5 shadow-lg">
          <h2 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider mb-4">
            Coin Flip (GPay)
          </h2>
          <p className="text-xs text-fintech-muted mb-4">
            Completed flips with <code className="text-fintech-muted">resolved_at</code> today (UTC). House cut is
            10% of the 2× pot.
          </p>
          {coinFlipStats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg bg-fintech-bg-card border border-white/10 p-4">
                <p className="text-xs text-fintech-muted uppercase">Total flips today</p>
                <p className="text-2xl font-bold text-white mt-1">{coinFlipStats.totalFlipsToday}</p>
              </div>
              <div className="rounded-lg bg-fintech-bg-card border border-white/10 p-4">
                <p className="text-xs text-fintech-muted uppercase">House cut today (GP)</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">
                  {coinFlipStats.totalHouseCutTodayMinor.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-fintech-bg-card border border-white/10 p-4">
                <p className="text-xs text-fintech-muted uppercase">GPay wagered today</p>
                <p className="text-2xl font-bold text-amber-200 mt-1">
                  {coinFlipStats.totalWageredTodayMinor.toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-fintech-muted text-sm">Loading Coin Flip stats…</p>
          )}
        </section>

        <section className="mb-10 rounded-xl border border-[#10B981]/25 bg-fintech-bg-card/90 p-5 shadow-lg">
          <h2 className="text-sm font-semibold text-emerald-300 uppercase tracking-wider mb-2">
            Platform fees (games &amp; services)
          </h2>
          <p className="text-xs text-fintech-muted mb-4">
            Aggregated from <code className="text-fintech-muted">platform_earnings</code> (C-Lo fees, etc.). Fight arena
            fees remain on the <a className="text-emerald-400/90 underline" href="/admin/revenue">Revenue</a> page.
          </p>
          {gameRevenueError && (
            <p className="text-sm text-amber-300/90 mb-3">{gameRevenueError}</p>
          )}
          {gameRevenue ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <RevenueCard title="Today's revenue" amountCents={gameRevenue.today.total} color="#10B981" />
                <RevenueCard title="This week" amountCents={gameRevenue.thisWeek.total} color="#3B82F6" />
                <RevenueCard title="This month" amountCents={gameRevenue.thisMonth.total} color="#7C3AED" />
                <RevenueCard title="All time" amountCents={gameRevenue.allTime.total} color="#F5C842" />
              </div>
              <p className="text-[11px] text-fintech-muted mb-4">
                Today: C-Lo ${(gameRevenue.today.celo / 100).toFixed(2)} · Coin{" "}
                ${(gameRevenue.today.coinflip / 100).toFixed(2)} · Ads ${(gameRevenue.today.ads / 100).toFixed(2)} ·
                Memberships ${(gameRevenue.today.memberships / 100).toFixed(2)}
              </p>
            </>
          ) : (
            !gameRevenueError && <p className="text-fintech-muted text-sm">Loading fee revenue…</p>
          )}

          {gameRevenue?.celoActivity && (
            <div className="mt-6 border-t border-white/10 pt-5">
              <h3 className="text-xs font-semibold text-[#F5C842]/90 uppercase tracking-wider mb-3">C-Lo activity</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-sm">
                <div className="rounded-lg bg-black/30 border border-white/10 px-3 py-2">
                  <p className="text-fintech-muted text-xs">Rounds completed today</p>
                  <p className="text-lg font-bold text-white">{gameRevenue.celoActivity.roundsCompletedToday}</p>
                </div>
                <div className="rounded-lg bg-black/30 border border-white/10 px-3 py-2">
                  <p className="text-fintech-muted text-xs">Player rolls today</p>
                  <p className="text-lg font-bold text-white">{gameRevenue.celoActivity.playerRollsToday}</p>
                </div>
                <div className="rounded-lg bg-black/30 border border-white/10 px-3 py-2">
                  <p className="text-fintech-muted text-xs">Avg pot today</p>
                  <p className="text-lg font-bold text-emerald-300">
                    ${(gameRevenue.celoActivity.avgPotCentsToday / 100).toFixed(2)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-fintech-muted mb-2">Recent completed rounds</p>
              <AdminScrollHint />
              <AdminTableWrap>
                <table className="w-full text-left text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-white/10 text-fintech-muted">
                      <th className="pb-2 pr-3 font-medium">Round</th>
                      <th className="pb-2 pr-3 font-medium">Completed</th>
                      <th className="pb-2 pr-3 font-medium text-right">Prize pool</th>
                      <th className="pb-2 pr-3 font-medium text-right">Platform fee</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameRevenue.celoActivity.recentRounds.map((r) => (
                      <tr key={r.id} className="border-b border-white/5">
                        <td className="py-2 pr-3 font-mono text-violet-200">{r.shortId}</td>
                        <td className="py-2 pr-3 text-fintech-muted">
                          {r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}
                        </td>
                        <td className="py-2 pr-3 text-right text-white">
                          ${((r.prize_pool_sc ?? 0) / 100).toFixed(2)}
                        </td>
                        <td className="py-2 pr-3 text-right text-emerald-300/90">
                          ${((r.platform_fee_sc ?? 0) / 100).toFixed(2)}
                        </td>
                        <td className="py-2 text-fintech-muted capitalize">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableWrap>
            </div>
          )}

          {gameRevenue && gameRevenue.recentTransactions.length > 0 && (
            <div className="mt-6 border-t border-white/10 pt-5">
              <h3 className="text-xs font-semibold text-fintech-muted uppercase tracking-wider mb-3">
                Recent platform fee lines
              </h3>
              <AdminScrollHint />
              <AdminTableWrap>
                <table className="w-full text-left text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b border-white/10 text-fintech-muted">
                      <th className="pb-2 pr-3 font-medium">Time</th>
                      <th className="pb-2 pr-3 font-medium">Source</th>
                      <th className="pb-2 pr-3 font-medium">Description</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameRevenue.recentTransactions.slice(0, 15).map((tx) => (
                      <tr key={tx.id} className="border-b border-white/5">
                        <td className="py-2 pr-3 text-fintech-muted">
                          {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="py-2 pr-3 text-white">{tx.source}</td>
                        <td className="py-2 pr-3 text-fintech-muted truncate max-w-[220px]">
                          {tx.description ?? "—"}
                        </td>
                        <td className="py-2 text-right text-emerald-300">${(tx.amount_cents / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableWrap>
            </div>
          )}
        </section>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-fintech-muted uppercase tracking-wider">Total Users</h2>
            <p className="text-2xl font-bold text-white mt-2">{stats.totalUsers}</p>
          </div>
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-fintech-muted uppercase tracking-wider">Total Deposits</h2>
            <p className="text-2xl font-bold text-emerald-400 mt-2">
              ${(stats.totalDeposits / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-fintech-muted uppercase tracking-wider">Total Withdrawals</h2>
            <p className="text-2xl font-bold text-amber-400 mt-2">
              ${(stats.totalWithdrawals / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-fintech-muted uppercase tracking-wider">User Balances (total)</h2>
            <p className="text-2xl font-bold text-white mt-2">
              ${(stats.totalBalance / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-fintech-muted uppercase tracking-wider">Total Profit</h2>
            <p className="text-2xl font-bold text-emerald-400 mt-2">
              ${(Number(stats.totalProfit) / 100).toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-5 shadow-lg">
            <h2 className="text-xs font-medium text-fintech-muted uppercase tracking-wider">Total Revenue</h2>
            <p className="text-2xl font-bold text-white mt-2">
              ${(Number(stats.totalRevenue) / 100).toFixed(2)}
            </p>
          </div>
        </div>

        <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-5 shadow-lg">
          <h2 className="text-sm font-medium text-fintech-muted uppercase tracking-wider mb-4">Recent Transactions</h2>
          {stats.recentTransactions.length === 0 ? (
            <p className="text-fintech-muted text-sm">No transactions yet.</p>
          ) : (
            <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-white/10 text-fintech-muted">
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
                      <td className="py-3 pr-4 text-fintech-muted">
                        {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 pr-4 text-white truncate max-w-[180px]">{tx.user_email ?? tx.id ?? "—"}</td>
                      <td className="py-3 pr-4 text-fintech-muted capitalize">{tx.type}</td>
                      <td className="py-3 pr-4 text-fintech-muted capitalize">{tx.status}</td>
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
        <section className="rounded-xl bg-fintech-bg-card border border-white/10 p-5 shadow-lg mt-6">
          <h2 className="text-sm font-medium text-fintech-muted uppercase tracking-wider mb-4">Stripe payment logs</h2>
          {stats.recentPayments.length === 0 ? (
            <p className="text-fintech-muted text-sm">No Stripe payments yet.</p>
          ) : (
            <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[480px]">
                <thead>
                  <tr className="border-b border-white/10 text-fintech-muted">
                    <th className="pb-3 pr-4 font-medium">Date</th>
                    <th className="pb-3 pr-4 font-medium">Email</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentPayments.slice(0, 20).map((p) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 pr-4 text-fintech-muted">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 pr-4 text-white truncate max-w-[200px]">{p.email ?? "—"}</td>
                      <td className="py-3 pr-4 text-fintech-muted capitalize">{p.status}</td>
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
