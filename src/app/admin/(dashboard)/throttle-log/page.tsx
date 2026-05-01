"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

type Row = {
  id: string;
  ran_at: string;
  observed_margin_pct: number | null;
  action_taken: string;
  prev_click_effective: number | null;
  new_click_effective: number | null;
  prev_view_effective: number | null;
  new_view_effective: number | null;
  notes: string | null;
};

function AdminThrottleLogInner() {
  const session = useAdminSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/admin/throttle-log`, {
      credentials: "include",
      headers: adminApiHeaders(session),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.message && !data.rows) throw new Error(data.message);
        setRows(data.rows ?? []);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-2">Throttle log</h1>
      <p className="text-fintech-muted text-sm mb-6">
        Last 100 margin throttle runs and manual overrides.{" "}
        <Link href="/admin/platform" className="text-fintech-accent hover:underline">
          Platform settings
        </Link>
      </p>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>}

      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto bg-fintech-bg-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-fintech-muted">
                <th className="p-3 whitespace-nowrap">Time (UTC)</th>
                <th className="p-3">Margin %</th>
                <th className="p-3">Action</th>
                <th className="p-3 whitespace-nowrap">Click ¢ before → after</th>
                <th className="p-3 whitespace-nowrap">View ¢ before → after</th>
                <th className="p-3 min-w-[180px]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/5 text-white">
                  <td className="p-3 whitespace-nowrap text-white/90">
                    {r.ran_at ? new Date(r.ran_at).toISOString().replace("T", " ").slice(0, 19) : "—"}
                  </td>
                  <td className="p-3">
                    {r.observed_margin_pct === null || r.observed_margin_pct === undefined
                      ? "—"
                      : `${Number(r.observed_margin_pct).toFixed(2)}%`}
                  </td>
                  <td className="p-3 font-mono text-xs">{r.action_taken}</td>
                  <td className="p-3 whitespace-nowrap">
                    {r.prev_click_effective ?? "—"} → {r.new_click_effective ?? "—"}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {r.prev_view_effective ?? "—"} → {r.new_view_effective ?? "—"}
                  </td>
                  <td className="p-3 text-white/70 text-xs">{r.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-6 text-fintech-muted text-center">No entries yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminThrottleLogPage() {
  return (
    <AdminPageGate>
      <AdminThrottleLogInner />
    </AdminPageGate>
  );
}
