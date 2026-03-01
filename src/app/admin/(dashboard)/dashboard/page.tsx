"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync } from "@/lib/admin-supabase";

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

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    const headers = {
      "X-Admin-Id": session.adminId,
      ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    };
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
    const headers = {
      "X-Admin-Id": session.adminId,
      ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    };
    try {
      const statsRes = await fetch("/api/admin/stats", { headers });
      const statsData = statsRes.ok ? await statsRes.json() : await statsRes.json().catch(() => ({}));
      if (!statsRes.ok) {
        setStatsError(statsData?.message ?? `Stats failed (${statsRes.status}).`);
      }
      setStats({
        totalUsers: statsRes.ok ? (statsData.totalUsers ?? 0) : 0,
        totalDeposits: statsRes.ok ? (statsData.totalDeposits ?? 0) : 0,
        totalWithdrawals: statsRes.ok ? (statsData.totalWithdrawals ?? 0) : 0,
        totalBalance: statsRes.ok ? (statsData.totalBalance ?? 0) : 0,
        totalProfit: statsRes.ok ? (statsData.totalProfit ?? 0) : 0,
        totalRevenue: statsRes.ok ? (statsData.totalRevenue ?? 0) : 0,
        recentTransactions: statsRes.ok && Array.isArray(statsData.recentTransactions) ? statsData.recentTransactions : [],
      });
    } catch {
      setStatsError("Failed to load admin stats.");
      setStats({
        totalUsers: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalBalance: 0,
        totalProfit: 0,
        totalRevenue: 0,
        recentTransactions: [],
      });
    } finally {
      setLoading(false);
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
