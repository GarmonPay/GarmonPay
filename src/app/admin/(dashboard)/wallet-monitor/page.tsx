"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export default function AdminWalletMonitorPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [stats, setStats] = useState<{
    totalDepositsCents: number;
    totalWithdrawalsCents: number;
    totalBalanceCents: number;
    platformProfitCents: number;
    userCount: number;
    userBalances: Array<{ user_id: string; email: string | null; balance_cents: number; updated_at: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/admin/wallet-stats`, { credentials: "include", headers: adminApiHeaders(session) })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  if (loading && !stats) {
    return (
      <div className="p-6">
        <p className="text-[#9ca3af]">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-500/20 text-red-400 p-4">{error}</div>
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Wallet Monitor</h1>
      <p className="text-[#9ca3af] mb-6">
        Ledger-based wallet: total deposits, withdrawals, user balances, and platform profit.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
          <p className="text-[#9ca3af] text-sm">Total deposits</p>
          <p className="text-2xl font-bold text-white">{formatCents(s.totalDepositsCents)}</p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
          <p className="text-[#9ca3af] text-sm">Total withdrawals</p>
          <p className="text-2xl font-bold text-white">{formatCents(s.totalWithdrawalsCents)}</p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
          <p className="text-[#9ca3af] text-sm">User balances (total)</p>
          <p className="text-2xl font-bold text-white">{formatCents(s.totalBalanceCents)}</p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
          <p className="text-[#9ca3af] text-sm">Platform profit</p>
          <p className="text-2xl font-bold text-[#10b981]">{formatCents(s.platformProfitCents)}</p>
        </div>
      </div>

      <h2 className="text-lg font-bold text-white mb-3">User balances (top 100)</h2>
      <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-3 text-sm font-medium text-[#9ca3af]">User / Email</th>
              <th className="p-3 text-sm font-medium text-[#9ca3af]">Balance</th>
              <th className="p-3 text-sm font-medium text-[#9ca3af]">Updated</th>
            </tr>
          </thead>
          <tbody>
            {(s.userBalances ?? []).map((row) => (
              <tr key={row.user_id} className="border-b border-white/5">
                <td className="p-3 text-white font-mono text-sm">{row.email ?? row.user_id.slice(0, 8)}</td>
                <td className="p-3 text-white font-medium">{formatCents(row.balance_cents)}</td>
                <td className="p-3 text-[#9ca3af] text-sm">{row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!s.userBalances || s.userBalances.length === 0) && (
          <p className="p-4 text-[#9ca3af] text-sm">No wallet balances yet.</p>
        )}
      </div>
    </div>
  );
}
