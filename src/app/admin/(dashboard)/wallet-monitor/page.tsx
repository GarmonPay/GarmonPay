"use client";

import { useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

function AdminWalletMonitorInner() {
  const session = useAdminSession();
  const [stats, setStats] = useState<{
    totalDepositsCents: number;
    totalWithdrawalsCents: number;
    totalBalanceCents: number;
    ledgerSurplusCents: number;
    userCount: number;
    userBalances: Array<{ user_id: string; email: string | null; balance_cents: number; updated_at: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  if (loading && !stats) {
    return (
      <div className="p-6">
        <p className="text-white/60">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-500/20 p-4 text-red-400">{error}</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6 text-white/60">
        No wallet stats returned.
      </div>
    );
  }

  const s = stats;

  return (
    <div className="p-6">
      <h1 className="font-[family-name:var(--font-admin-display)] text-xl font-bold text-white mb-2">
        Wallet Monitor
      </h1>
      <p className="mb-6 text-white/60">
        Ledger-based wallet totals. <strong className="text-white/80">Ledger surplus</strong> is deposits − ledger
        withdrawals − user balances (not Σ platform_earnings).
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-4">
          <p className="text-sm text-white/50">Total deposits</p>
          <p className="text-2xl font-bold text-white">{formatCents(s.totalDepositsCents)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-4">
          <p className="text-sm text-white/50">Total withdrawals</p>
          <p className="text-2xl font-bold text-white">{formatCents(s.totalWithdrawalsCents)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-4">
          <p className="text-sm text-white/50">User balances (total)</p>
          <p className="text-2xl font-bold text-white">{formatCents(s.totalBalanceCents)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-4">
          <p className="text-sm text-white/50">Ledger surplus</p>
          <p className="text-2xl font-bold text-emerald-400">{formatCents(s.ledgerSurplusCents)}</p>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-bold text-white">User balances (top 100)</h2>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0e0118]/90">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              <th className="p-3 text-sm font-medium text-white/50">User / Email</th>
              <th className="p-3 text-sm font-medium text-white/50">Balance</th>
              <th className="p-3 text-sm font-medium text-white/50">Updated</th>
            </tr>
          </thead>
          <tbody>
            {(s.userBalances ?? []).map((row) => (
              <tr key={row.user_id} className="border-b border-white/5">
                <td className="p-3 font-mono text-sm text-white">{row.email ?? row.user_id.slice(0, 8)}</td>
                <td className="p-3 font-medium text-white">{formatCents(row.balance_cents)}</td>
                <td className="p-3 text-sm text-white/55">{row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!s.userBalances || s.userBalances.length === 0) && (
          <p className="p-4 text-sm text-white/55">No wallet balances yet.</p>
        )}
      </div>
    </div>
  );
}

export default function AdminWalletMonitorPage() {
  return (
    <AdminPageGate>
      <AdminWalletMonitorInner />
    </AdminPageGate>
  );
}
