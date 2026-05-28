"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { localeInt } from "@/lib/format-number";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

type Tab = "overview" | "revenue" | "profit" | "throttle";

type FinancePayload = {
  overview: {
    platformRevenueTodayCents: number;
    platformRevenueMtdCents: number;
    platformRevenueAllTimeCents: number;
    watchGpcPaid24h: number;
    watchGpcPaidMtd: number;
    watchGpcPaidAllTime: number;
    referralGpcPaidMtd: number;
    referralGpcPaidAllTime: number;
    gpcInCirculationMinor: number;
    goldPurchasedMonth: number;
    netMarginMtdCents: number;
  };
  revenue: {
    inflowsToday: { totalCents: number; breakdown: Record<string, number> };
    inflowsMtd: { totalCents: number; breakdown: Record<string, number> };
    inflowsAllTime: { totalCents: number; breakdown: Record<string, number> };
    gpcOutflows: {
      watchEarnMtd: number;
      watchEarnAllTime: number;
      referralCommissionMtd: number;
      referralCommissionAllTime: number;
    };
  };
  profit: {
    platformRevenueAllTimeCents: number;
    watchGpcOutflowAllTime: number;
    referralGpcOutflowAllTime: number;
    note: string;
  };
  throttleLog: {
    rows: Array<{
      id: string;
      created_at: string;
      observed_margin_pct: number | null;
      action_taken: string;
      prev_click_effective: number | null;
      new_click_effective: number | null;
      prev_view_effective: number | null;
      new_view_effective: number | null;
      notes: string | null;
    }>;
    message?: string;
  };
};

function usd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function BreakdownTable({
  title,
  totalCents,
  breakdown,
  gpcOutflows,
}: {
  title: string;
  totalCents: number;
  breakdown: Record<string, number>;
  gpcOutflows?: { label: string; mtd: number; allTime?: number }[];
}) {
  return (
    <div className="card-lux p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="text-lg font-bold text-emerald-400">{usd(totalCents)} inflows</p>
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="text-fintech-muted border-b border-white/10">
            <th className="py-2">Source</th>
            <th className="py-2 text-right">USD</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(breakdown).map(([k, v]) => (
            <tr key={k} className="border-b border-white/5 text-white">
              <td className="py-2 capitalize">{k}</td>
              <td className="py-2 text-right">{usd(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {gpcOutflows && gpcOutflows.length > 0 && (
        <>
          <p className="text-xs text-fintech-muted pt-2">GPC outflows (coin_transactions)</p>
          <table className="w-full text-sm text-left">
            <tbody>
              {gpcOutflows.map((o) => (
                <tr key={o.label} className="border-b border-white/5 text-[#fde047]">
                  <td className="py-2">{o.label}</td>
                  <td className="py-2 text-right">
                    {localeInt(o.mtd)} GPC{o.allTime != null ? ` · ${localeInt(o.allTime)} all-time` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function AdminFinanceInner() {
  const session = useAdminSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<FinancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/finance`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to load");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "revenue", label: "Revenue Breakdown" },
    { id: "profit", label: "Profit" },
    { id: "throttle", label: "Throttle History" },
  ];

  const o = data?.overview;

  return (
    <div className="p-4 tablet:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Platform Finance</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Revenue, watch-earn GPC COGS, and legacy throttle history.{" "}
          <Link href="/admin/videos" className="text-fintech-accent hover:underline">
            Videos
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-violet-600 text-white" : "bg-white/5 text-fintech-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : !data ? null : (
        <>
          {tab === "overview" && o && (
            <div className="space-y-6">
              <div className="card-lux p-4 border border-[#fde047]/30">
                <h2 className="text-sm font-semibold text-[#fde047] mb-3">Watch earn COGS (GPC)</h2>
                <div className="grid gap-3 sm:grid-cols-3 text-sm">
                  <div>
                    <p className="text-fintech-muted">Paid (24h)</p>
                    <p className="text-xl font-bold text-white">{localeInt(o.watchGpcPaid24h)} GPC</p>
                  </div>
                  <div>
                    <p className="text-fintech-muted">Paid (MTD)</p>
                    <p className="text-xl font-bold text-white">{localeInt(o.watchGpcPaidMtd)} GPC</p>
                  </div>
                  <div>
                    <p className="text-fintech-muted">Paid (all time)</p>
                    <p className="text-xl font-bold text-white">{localeInt(o.watchGpcPaidAllTime)} GPC</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="card-lux p-4">
                  <p className="text-xs text-fintech-muted">Platform revenue (today)</p>
                  <p className="text-xl font-bold text-emerald-400">{usd(o.platformRevenueTodayCents)}</p>
                </div>
                <div className="card-lux p-4">
                  <p className="text-xs text-fintech-muted">Platform revenue (MTD)</p>
                  <p className="text-xl font-bold text-emerald-400">{usd(o.platformRevenueMtdCents)}</p>
                </div>
                <div className="card-lux p-4">
                  <p className="text-xs text-fintech-muted">Platform revenue (all time)</p>
                  <p className="text-xl font-bold text-emerald-400">{usd(o.platformRevenueAllTimeCents)}</p>
                </div>
                <div className="card-lux p-4">
                  <p className="text-xs text-fintech-muted">GPC in circulation</p>
                  <p className="text-xl font-bold text-white">{localeInt(o.gpcInCirculationMinor)}</p>
                </div>
                <div className="card-lux p-4">
                  <p className="text-xs text-fintech-muted">GOLD purchased (MTD)</p>
                  <p className="text-xl font-bold text-white">{localeInt(o.goldPurchasedMonth)}</p>
                </div>
                <div className="card-lux p-4">
                  <p className="text-xs text-fintech-muted">Referral GPC paid (MTD)</p>
                  <p className="text-xl font-bold text-[#fde047]">{localeInt(o.referralGpcPaidMtd)} GPC</p>
                </div>
              </div>
            </div>
          )}

          {tab === "revenue" && data.revenue && (
            <div className="grid gap-4 lg:grid-cols-1">
              <BreakdownTable
                title="Today"
                totalCents={data.revenue.inflowsToday.totalCents}
                breakdown={data.revenue.inflowsToday.breakdown}
                gpcOutflows={[
                  {
                    label: "Watch earn",
                    mtd: data.revenue.gpcOutflows.watchEarnMtd,
                    allTime: data.revenue.gpcOutflows.watchEarnAllTime,
                  },
                  {
                    label: "Referral commission",
                    mtd: data.revenue.gpcOutflows.referralCommissionMtd,
                    allTime: data.revenue.gpcOutflows.referralCommissionAllTime,
                  },
                ]}
              />
              <BreakdownTable
                title="Month to date"
                totalCents={data.revenue.inflowsMtd.totalCents}
                breakdown={data.revenue.inflowsMtd.breakdown}
              />
              <BreakdownTable
                title="All time"
                totalCents={data.revenue.inflowsAllTime.totalCents}
                breakdown={data.revenue.inflowsAllTime.breakdown}
              />
            </div>
          )}

          {tab === "profit" && data.profit && (
            <div className="card-lux p-6 max-w-lg space-y-4">
              <p className="text-sm text-fintech-muted">{data.profit.note}</p>
              <div>
                <p className="text-xs text-fintech-muted">Platform earnings (all time, USD)</p>
                <p className="text-2xl font-bold text-emerald-400">
                  {usd(data.profit.platformRevenueAllTimeCents)}
                </p>
              </div>
              <div>
                <p className="text-xs text-fintech-muted">Watch GPC outflow (all time)</p>
                <p className="text-xl font-bold text-[#fde047]">
                  −{localeInt(data.profit.watchGpcOutflowAllTime)} GPC
                </p>
              </div>
              <div>
                <p className="text-xs text-fintech-muted">Referral GPC outflow (all time)</p>
                <p className="text-xl font-bold text-[#fde047]">
                  −{localeInt(data.profit.referralGpcOutflowAllTime)} GPC
                </p>
              </div>
            </div>
          )}

          {tab === "throttle" && (
            <div className="rounded-xl border border-white/10 overflow-x-auto bg-fintech-bg-card">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-fintech-muted">
                    <th className="p-3 whitespace-nowrap">Time (UTC)</th>
                    <th className="p-3">Margin %</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Click ¢</th>
                    <th className="p-3">View ¢</th>
                    <th className="p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.throttleLog.rows ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-white/5 text-white">
                      <td className="p-3 whitespace-nowrap text-xs">
                        {r.created_at
                          ? new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19)
                          : "—"}
                      </td>
                      <td className="p-3">
                        {r.observed_margin_pct == null ? "—" : `${Number(r.observed_margin_pct).toFixed(2)}%`}
                      </td>
                      <td className="p-3 font-mono text-xs">{r.action_taken}</td>
                      <td className="p-3 text-xs whitespace-nowrap">
                        {r.prev_click_effective ?? "—"} → {r.new_click_effective ?? "—"}
                      </td>
                      <td className="p-3 text-xs whitespace-nowrap">
                        {r.prev_view_effective ?? "—"} → {r.new_view_effective ?? "—"}
                      </td>
                      <td className="p-3 text-xs text-white/70">{r.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.throttleLog.rows.length === 0 && (
                <p className="p-6 text-center text-fintech-muted">No throttle entries yet.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminFinancePage() {
  return (
    <AdminPageGate>
      <AdminFinanceInner />
    </AdminPageGate>
  );
}
