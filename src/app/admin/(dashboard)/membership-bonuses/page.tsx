"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { getApiRoot } from "@/lib/api";
import { localeInt } from "@/lib/format-number";

const API_BASE = getApiRoot();

type Row = {
  id: string;
  bonus_type: string;
  from_tier: string | null;
  to_tier: string;
  gpc_amount: number;
  credited_at: string;
  user_id: string;
};

function AdminMembershipBonusesPageInner() {
  const session = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    totals: { gpcToday: number; gpcThisMonth: number };
    breakdownByTypeTier: Record<string, number>;
    recent: Row[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/membership-bonuses`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.message === "string" ? j.message : "Failed to load");
        setData(null);
        return;
      }
      setData(j as typeof data);
    } catch {
      setError("Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto p-6 text-white space-y-8">
      <h1 className="text-2xl font-bold text-amber-200">Membership GPC bonuses</h1>
      {error && <p className="text-red-400">{error}</p>}
      {loading ? (
        <p className="text-zinc-400">Loading…</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-4">
              <p className="text-xs uppercase text-zinc-500">GPC issued today</p>
              <p className="text-2xl font-bold tabular-nums text-amber-300">{localeInt(data.totals.gpcToday)} GPC</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-zinc-900/60 p-4">
              <p className="text-xs uppercase text-zinc-500">GPC issued this month</p>
              <p className="text-2xl font-bold tabular-nums text-amber-300">{localeInt(data.totals.gpcThisMonth)} GPC</p>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-2">Breakdown (type + tier)</h2>
            <ul className="space-y-1 text-sm text-zinc-300">
              {Object.entries(data.breakdownByTypeTier).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-4 border-b border-white/5 py-1">
                  <span>{k}</span>
                  <span className="tabular-nums text-emerald-400">+{localeInt(v)} GPC</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-2">Recent (100)</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-500">
                    <th className="p-2">Date</th>
                    <th className="p-2">Type</th>
                    <th className="p-2">Tier</th>
                    <th className="p-2">GPC</th>
                    <th className="p-2">User</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 text-zinc-300">
                      <td className="p-2 whitespace-nowrap">{new Date(r.credited_at).toLocaleString()}</td>
                      <td className="p-2">{r.bonus_type}</td>
                      <td className="p-2">{r.to_tier}</td>
                      <td className="p-2 tabular-nums text-emerald-400">+{localeInt(r.gpc_amount)}</td>
                      <td className="p-2 font-mono text-xs">{r.user_id.slice(0, 8)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AdminMembershipBonusesPage() {
  return (
    <AdminPageGate>
      <AdminMembershipBonusesPageInner />
    </AdminPageGate>
  );
}
