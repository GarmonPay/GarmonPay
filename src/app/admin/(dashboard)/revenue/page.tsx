"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdminRevenuePage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [data, setData] = useState<AdminRevenueData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    setError(null);
    fetch(`${API_BASE}/admin/revenue`, {
      headers: adminApiHeaders(session),
    })
      .then((res) => {
        if (res.status === 403) {
          throw new Error("Access denied. Ensure your user has role = 'admin' or is_super_admin = true in public.users.");
        }
        if (!res.ok) {
          return res.json().then((b: { message?: string }) => {
            throw new Error(b.message ?? "Failed to load revenue");
          });
        }
        return res.json();
      })
      .then((body: AdminRevenueData) => {
        setData({
          totalFightRevenueCents: body.totalFightRevenueCents ?? 0,
          dailyRevenueCents: body.dailyRevenueCents ?? 0,
          monthlyRevenueCents: body.monthlyRevenueCents ?? 0,
          fightCount: body.fightCount ?? 0,
          chartData: Array.isArray(body.chartData) ? body.chartData : [],
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
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh] text-[#9ca3af]">
        Loading…
      </div>
    );
  }

  const maxChartCents = Math.max(1, ...data.chartData.map((p) => p.amountCents));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Fight Revenue</h1>
      <p className="text-[#9ca3af] mb-6">
        Platform revenue from fight arena fees (10% of each completed fight pot).
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] mb-1">Total Fight Revenue</p>
          <p className="text-2xl font-bold text-[#10b981]">
            {formatCents(data.totalFightRevenueCents)}
          </p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] mb-1">Daily Revenue</p>
          <p className="text-2xl font-bold text-white">
            {formatCents(data.dailyRevenueCents)}
          </p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] mb-1">Monthly Revenue</p>
          <p className="text-2xl font-bold text-white">
            {formatCents(data.monthlyRevenueCents)}
          </p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-5">
          <p className="text-sm text-[#9ca3af] mb-1">Fight Count</p>
          <p className="text-2xl font-bold text-white">{data.fightCount}</p>
        </div>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Profit Chart (last 30 days)</h2>
        <div className="flex items-end gap-1 h-48">
          {data.chartData.map((point, i) => (
            <div
              key={point.date}
              className="flex-1 flex flex-col items-center gap-1 min-w-0"
              title={`${formatShortDate(point.date)}: ${formatCents(point.amountCents)}`}
            >
              <div
                className="w-full rounded-t bg-[#2563eb] min-h-[4px] transition-all"
                style={{
                  height: `${(point.amountCents / maxChartCents) * 100}%`,
                }}
              />
              <span className="text-[10px] text-[#6b7280] truncate w-full text-center">
                {i % 5 === 0 ? formatShortDate(point.date) : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
