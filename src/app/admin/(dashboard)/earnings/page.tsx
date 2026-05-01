"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function AdminEarningsInner() {
  const session = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<{
    platformRevenueAllTimeCents: number;
    approvedWithdrawalsFromRequestsCents: number;
    totalProfit: number;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/admin/stats`, { credentials: "include", headers: adminApiHeaders(session) })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load stats");
        return res.json();
      })
      .then(
        (data: {
          platformRevenueAllTimeCents?: number;
          approvedWithdrawalsFromRequestsCents?: number;
          totalProfit?: number;
        }) => {
          setTotals({
            platformRevenueAllTimeCents: data.platformRevenueAllTimeCents ?? 0,
            approvedWithdrawalsFromRequestsCents: data.approvedWithdrawalsFromRequestsCents ?? 0,
            totalProfit: data.totalProfit ?? 0,
          });
        }
      )
      .catch(() => {
        setError("Could not load earnings summary.");
        setTotals(null);
      })
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <div className="p-6">
      <h1 className="font-[family-name:var(--font-admin-display)] text-xl font-bold text-white mb-2">Earnings</h1>
      <p className="mb-6 text-white/60">
        Platform-wide totals from <code className="text-[#f5c842]/90">/api/admin/stats</code> (same definitions as Profit).
      </p>

      {loading ? (
        <p className="text-white/60">Loading summary…</p>
      ) : error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>
      ) : totals ? (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-5">
            <p className="text-xs uppercase tracking-wide text-white/50">Σ platform_earnings</p>
            <p className="mt-1 text-2xl font-bold text-emerald-400">{formatUsd(totals.platformRevenueAllTimeCents)}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-5">
            <p className="text-xs uppercase tracking-wide text-white/50">Σ withdrawals (approved/paid)</p>
            <p className="mt-1 text-2xl font-bold text-white">{formatUsd(totals.approvedWithdrawalsFromRequestsCents)}</p>
          </div>
          <div className="rounded-xl border border-[#7c3aed]/30 bg-[#0e0118]/90 p-5">
            <p className="text-xs uppercase tracking-wide text-white/50">Net profit</p>
            <p className="mt-1 text-2xl font-bold text-[#f5c842]">{formatUsd(totals.totalProfit)}</p>
          </div>
        </div>
      ) : null}

      <div className="max-w-md space-y-4 rounded-xl border border-white/10 bg-[#0e0118]/90 p-6">
        <p className="text-sm text-white/60">Drill down by source:</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/profit"
            className="inline-block rounded-lg bg-[#7c3aed] px-4 py-2 font-medium text-white hover:bg-[#6d28d9]"
          >
            View profit
          </Link>
          <Link
            href="/admin/revenue"
            className="inline-block rounded-lg bg-[#f5c842] px-4 py-2 font-medium text-[#0e0118] hover:bg-[#e6bb3d]"
          >
            View fight & platform charts
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AdminEarningsPage() {
  return (
    <AdminPageGate>
      <AdminEarningsInner />
    </AdminPageGate>
  );
}
