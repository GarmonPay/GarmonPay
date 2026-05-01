"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

function formatCents(cents: number | null | undefined) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  const n = Number(cents);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${(Math.abs(n) / 100).toFixed(2)}`;
}

type DriftRow = {
  email: string;
  wallet_balances_cents: number;
  ledger_latest_cents: number | null;
  drift_cents: number;
};

type MonitorPayload = {
  driftRows: DriftRow[];
  totalUsers: number;
  cleanUsers: number;
  checkedAt: string;
};

function AdminBalanceMonitorPageInner() {
  const session = useAdminSession();
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingEmail, setSyncingEmail] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/balance-monitor`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as MonitorPayload;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      void load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function syncLedger(email: string) {
    setSyncingEmail(email);
    setSyncMessage(null);
    try {
      const res = await fetch(`${API_BASE}/admin/balance-monitor/fix`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const cents = (j as { correctedCents?: number }).correctedCents ?? 0;
      setSyncMessage(`Synced ${email}: corrected ${formatCents(cents)}`);
      await load();
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncingEmail(null);
    }
  }

  if (loading && !data) {
    return (
      <div className="p-6">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>
      </div>
    );
  }

  const payload = data!;
  const drifted = payload.driftRows ?? [];
  const allClean = drifted.length === 0;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold text-white mb-2">Balance Monitor</h1>
        <p className="mt-1 text-sm text-fintech-muted">
          Compares <code className="text-fintech-accent/90">wallet_balances</code> to the latest{" "}
          <code className="text-fintech-accent/90">wallet_ledger.balance_after</code> per user. Auto-refreshes every 60s.
        </p>
        {payload.checkedAt && (
          <p className="mt-2 text-xs text-fintech-muted">
            Last checked: {new Date(payload.checkedAt).toLocaleString()}
          </p>
        )}
      </div>

      {syncMessage && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-fintech-muted">
          {syncMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card-lux rounded-xl border border-white/[0.06] p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-fintech-muted">Total Users</p>
          <p className="mt-2 text-3xl font-bold text-white">{payload.totalUsers}</p>
        </div>
        <div className="card-lux rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-200/80">Clean</p>
          <p className="mt-2 text-3xl font-bold text-emerald-100">{payload.cleanUsers}</p>
        </div>
        <div className="card-lux rounded-xl border border-amber-500/25 bg-amber-950/20 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-200/80">Drifted</p>
          <p className="mt-2 text-3xl font-bold text-amber-100">{drifted.length}</p>
        </div>
      </div>

      {allClean ? (
        <div className="card-lux rounded-xl border border-emerald-500/30 bg-emerald-950/25 p-8 text-center">
          <p className="text-lg font-semibold text-emerald-100">All balances clean</p>
          <p className="mt-2 text-sm text-fintech-muted">No mismatch between stored balance and ledger trail.</p>
        </div>
      ) : (
        <div className="card-lux overflow-hidden rounded-xl border border-white/[0.06]">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-lg font-semibold text-white">Drifted users</h2>
            <p className="text-sm text-fintech-muted">Largest drift first. Sync adds a reconciling ledger row only.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] bg-black/20 text-fintech-muted">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">wallet_balances</th>
                  <th className="px-4 py-3 font-medium">ledger_latest</th>
                  <th className="px-4 py-3 font-medium">Drift amount</th>
                  <th className="px-4 py-3 font-medium w-40">Action</th>
                </tr>
              </thead>
              <tbody>
                {drifted.map((row, i) => (
                  <tr key={`${row.email}-${i}`} className="border-b border-white/[0.04] text-white">
                    <td className="px-4 py-3 font-mono text-xs text-fintech-muted">{row.email}</td>
                    <td className="px-4 py-3">{formatCents(row.wallet_balances_cents)}</td>
                    <td className="px-4 py-3">{formatCents(row.ledger_latest_cents)}</td>
                    <td className="px-4 py-3 font-medium text-amber-200/95">{formatCents(row.drift_cents)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={syncingEmail === row.email}
                        onClick={() => void syncLedger(row.email)}
                        className="btn-press min-h-touch rounded-lg bg-fintech-accent px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {syncingEmail === row.email ? "Syncing…" : "Sync Ledger"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminBalanceMonitorPage() {
  return (
    <AdminPageGate>
      <AdminBalanceMonitorPageInner />
    </AdminPageGate>
  );
}
