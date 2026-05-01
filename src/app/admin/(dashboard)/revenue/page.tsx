"use client";

import { useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

interface RevenueChartPoint {
  date: string;
  amountCents: number;
}

interface AdminRevenueData {
  totalFightRevenueCents: number;
  dailyRevenueCents: number;
  monthlyRevenueCents: number;
  fightCount: number;
  chartData: RevenueChartPoint[];
  platformEarningsChartData: RevenueChartPoint[];
  allTime: { total: number; breakdown: Record<string, number> };
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AdminRevenueInner() {
  const session = useAdminSession();
  const [data, setData] = useState<AdminRevenueData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetch(`${API_BASE}/admin/revenue`, {
      credentials: "include",
      headers: adminApiHeaders(session),
    })
      .then((res) => {
        if (res.status === 403) {
          throw new Error(
            "Access denied. Ensure your user has role = 'admin' or is_super_admin = true in public.users."
          );
        }
        if (!res.ok) {
          return res.json().then((b: { message?: string }) => {
            throw new Error(b.message ?? "Failed to load revenue");
          });
        }
        return res.json();
      })
      .then((body: AdminRevenueData & { message?: string }) => {
        setData({
          totalFightRevenueCents: body.totalFightRevenueCents ?? 0,
          dailyRevenueCents: body.dailyRevenueCents ?? 0,
          monthlyRevenueCents: body.monthlyRevenueCents ?? 0,
          fightCount: body.fightCount ?? 0,
          chartData: Array.isArray(body.chartData) ? body.chartData : [],
          platformEarningsChartData: Array.isArray(body.platformEarningsChartData)
            ? body.platformEarningsChartData
            : [],
          allTime: body.allTime ?? { total: 0, breakdown: {} },
        });
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load revenue");
        setData(null);
      });
  }, [session]);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-white/60">
        Loading fight & platform revenue…
      </div>
    );
  }

  const maxFightChart = Math.max(1, ...data.chartData.map((p) => p.amountCents));
  const maxPeChart = Math.max(1, ...data.platformEarningsChartData.map((p) => p.amountCents));

  return (
    <div className="p-6">
      <h1 className="font-[family-name:var(--font-admin-display)] text-xl font-bold text-white mb-2">
        Fight Revenue
      </h1>
      <p className="text-white/60 mb-6">
        Arena fees from <code className="text-[#f5c842]/90">platform_revenue</code> (fight source only). This is not total
        platform earnings.
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-5">
          <p className="mb-1 text-sm text-white/55">Total Fight Revenue</p>
          <p className="text-2xl font-bold text-emerald-400">{formatCents(data.totalFightRevenueCents)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-5">
          <p className="mb-1 text-sm text-white/55">Daily (fight)</p>
          <p className="text-2xl font-bold text-white">{formatCents(data.dailyRevenueCents)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-5">
          <p className="mb-1 text-sm text-white/55">Monthly (fight)</p>
          <p className="text-2xl font-bold text-white">{formatCents(data.monthlyRevenueCents)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#0e0118]/90 p-5">
          <p className="mb-1 text-sm text-white/55">Fight Count</p>
          <p className="text-2xl font-bold text-white">{data.fightCount}</p>
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-white/10 bg-[#0e0118]/90 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Fight Fees Chart (last 30 days)</h2>
        <div className="flex h-48 items-end gap-1">
          {data.chartData.map((point, i) => (
            <div
              key={point.date}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={`${formatShortDate(point.date)}: ${formatCents(point.amountCents)}`}
            >
              <div
                className="min-h-[4px] w-full rounded-t bg-[#f5c842] transition-all"
                style={{
                  height: `${(point.amountCents / maxFightChart) * 100}%`,
                }}
              />
              <span className="w-full truncate text-center text-[10px] text-white/45">
                {i % 5 === 0 ? formatShortDate(point.date) : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[#7c3aed]/30 bg-[#0e0118]/90 p-6">
        <h2 className="mb-2 text-lg font-semibold text-white">Platform Earnings (All Sources)</h2>
        <p className="mb-4 text-sm text-white/55">
          Sum of <code className="text-[#f5c842]/90">platform_earnings.amount_cents</code> (all products). All-time total:{" "}
          <strong className="text-emerald-400">{formatCents(data.allTime.total)}</strong>
        </p>
        <h3 className="mb-3 text-sm font-medium text-white/80">Platform Earnings Chart (last 30 days)</h3>
        <div className="flex h-48 items-end gap-1">
          {data.platformEarningsChartData.map((point, i) => (
            <div
              key={`pe-${point.date}-${i}`}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
              title={`${formatShortDate(point.date)}: ${formatCents(point.amountCents)}`}
            >
              <div
                className="min-h-[4px] w-full rounded-t bg-[#7c3aed] transition-all"
                style={{
                  height: `${(point.amountCents / maxPeChart) * 100}%`,
                }}
              />
              <span className="w-full truncate text-center text-[10px] text-white/45">
                {i % 5 === 0 ? formatShortDate(point.date) : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminRevenuePage() {
  return (
    <AdminPageGate>
      <AdminRevenueInner />
    </AdminPageGate>
  );
}
