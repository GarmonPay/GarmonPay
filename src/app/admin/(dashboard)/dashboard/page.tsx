"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync } from "@/lib/admin-supabase";
import { buildAdminAuthHeaders } from "@/lib/admin-request";

export default function Dashboard() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getAdminSessionAsync>>>(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalBalance: 0,
    totalProfit: 0,
    totalRevenue: 0,
    recentTransactions: [] as { id: string; type: string; amount: number; status: string; description: string | null; created_at: string; user_email?: string }[],
  });
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsMessage, setStatsMessage] = useState<string | null>(null);
  const [supabaseHealth, setSupabaseHealth] = useState<{
    connected: boolean;
    requiredTablesOk: boolean;
    missingTables: string[];
  } | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    const headers = buildAdminAuthHeaders(session);
    (async () => {
      await fetch("/api/admin/sync-users", {
        headers,
      });
      load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function load() {
    if (!session) return;
    setStatsError(null);
    setStatsMessage(null);
    const headers = buildAdminAuthHeaders(session);
    // TOTAL USERS and TOTAL DEPOSITS from /api/admin/dashboard (real Supabase: public.users count, public.deposits sum)
    const dashboardRes = await fetch("/api/admin/dashboard", { headers });
    const dashboardData = dashboardRes.ok ? await dashboardRes.json() : await dashboardRes.json().catch(() => ({}));
    const totalUsers = dashboardRes.ok ? (dashboardData.totalUsers ?? 0) : 0;
    const totalDeposits = dashboardRes.ok ? (dashboardData.totalDeposits ?? 0) : 0;
    if (!dashboardRes.ok) {
      setStatsError(dashboardData?.message ?? `Dashboard metrics failed (${dashboardRes.status}). Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.`);
    }
    // Other metrics and recent transactions from /api/admin/stats
    const statsRes = await fetch("/api/admin/stats", { headers });
    const statsData = statsRes.ok ? await statsRes.json() : await statsRes.json().catch(() => ({}));
    const healthRes = await fetch("/api/health/supabase", { headers });
    const healthData = healthRes.ok
      ? await healthRes.json().catch(() => null)
      : await healthRes.json().catch(() => null);
    if (healthData && typeof healthData === "object") {
      const hd = healthData as {
        connected?: boolean;
        requiredTablesOk?: boolean;
        tables?: Array<{ name: string; ok: boolean }>;
      };
      setSupabaseHealth({
        connected: !!hd.connected,
        requiredTablesOk: !!hd.requiredTablesOk,
        missingTables: Array.isArray(hd.tables)
          ? hd.tables.filter((t) => !t.ok).map((t) => t.name)
          : [],
      });
    } else {
      setSupabaseHealth(null);
    }
    if (!statsRes.ok && !dashboardRes.ok) {
      setStatsError((s) => s || statsData?.message || `Stats failed (${statsRes.status}).`);
    }
    if (statsRes.ok && statsData.message) setStatsMessage(statsData.message);
    setStats({
      totalUsers,
      totalDeposits,
      totalWithdrawals: statsRes.ok ? (statsData.totalWithdrawals ?? 0) : 0,
      totalBalance: statsRes.ok ? (statsData.totalBalance ?? 0) : 0,
      totalProfit: statsRes.ok ? (statsData.totalProfit ?? 0) : 0,
      totalRevenue: statsRes.ok ? (statsData.totalRevenue ?? 0) : 0,
      recentTransactions: statsRes.ok && Array.isArray(statsData.recentTransactions) ? statsData.recentTransactions : [],
    });
    setLoading(false);
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
      <header className="shrink-0 border-b border-white/10 bg-[#0f172a]/80 px-6 py-4">
        <h1 className="text-xl font-semibold text-white">Admin Dashboard</h1>
        <p className="text-sm text-[#9ca3af] mt-0.5">Overview of platform stats and recent activity</p>
      </header>
      <div className="p-6 flex-1">
        {statsError && (
          <div className="mb-6 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm flex items-center justify-between gap-4">
            <span>{statsError}</span>
            <button type="button" onClick={() => { setLoading(true); load(); }} className="shrink-0 px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium">
              Retry
            </button>
          </div>
        )}
        {statsMessage && !statsError && (
          <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-blue-200 text-sm">
            {statsMessage}
          </div>
        )}
        {supabaseHealth && (
          <div
            className={`mb-6 rounded-lg px-4 py-3 text-sm border ${
              supabaseHealth.connected && supabaseHealth.requiredTablesOk
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {supabaseHealth.connected && supabaseHealth.requiredTablesOk
              ? "Supabase connected. Required tables verified: users, transactions, deposits, withdrawals, earnings, admin_logs."
              : `Supabase table check needs attention. Missing/invalid: ${
                  supabaseHealth.missingTables.join(", ") || "unknown"
                }`}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
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
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-left text-sm">
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
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
