"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";

const API_BASE = getApiRoot();

type Tab = "ledger" | "audits" | "reconcile";

function formatCents(c: number | null | undefined) {
  if (c == null || Number.isNaN(Number(c))) return "—";
  const n = Number(c);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${(Math.abs(n) / 100).toFixed(2)}`;
}

type WalletStats = {
  totalDepositsCents: number;
  totalWithdrawalsCents: number;
  totalBalanceCents: number;
  ledgerSurplusCents: number;
  userCount: number;
  userBalances: Array<{ user_id: string; email: string | null; balance_cents: number; updated_at: string }>;
};

type DriftRow = {
  email: string;
  wallet_balances_cents: number;
  ledger_latest_cents: number | null;
  drift_cents: number;
};

type ReconcileResult = {
  ok: boolean;
  userId?: string;
  depositsTotalCents?: number;
  earningsTotalCents?: number;
  withdrawalsTotalCents?: number;
  adminCreditsTotalCents?: number;
  adminDebitsTotalCents?: number;
  subscriptionPaymentsTotalCents?: number;
  gamePlayTotalCents?: number;
  walletBalancesRowCents?: number | null;
  ledgerDerivedAvailableCents?: number;
  driftWalletBalancesMinusLedgerCents?: number | null;
  formulaNote?: string;
  message?: string;
};

function AdminWalletInner() {
  const session = useAdminSession();
  const [tab, setTab] = useState<Tab>("ledger");
  const [stats, setStats] = useState<WalletStats | null>(null);
  const [driftRows, setDriftRows] = useState<DriftRow[]>([]);
  const [driftMeta, setDriftMeta] = useState({ totalUsers: 0, cleanUsers: 0, checkedAt: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingEmail, setSyncingEmail] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupUserId, setLookupUserId] = useState("");
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);

  const loadLedger = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/wallet-stats`, {
      credentials: "include",
      headers: adminApiHeaders(session),
    });
    if (!res.ok) throw new Error("Failed to load wallet stats");
    return res.json() as Promise<WalletStats>;
  }, [session]);

  const loadAudits = useCallback(async () => {
    const res = await fetch(`${API_BASE}/admin/balance-monitor`, {
      credentials: "include",
      headers: adminApiHeaders(session),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { message?: string }).message ?? "Failed to load audits");
    }
    return res.json() as Promise<{
      driftRows: DriftRow[];
      totalUsers: number;
      cleanUsers: number;
      checkedAt: string;
    }>;
  }, [session]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [walletData, auditData] = await Promise.all([loadLedger(), loadAudits()]);
      setStats(walletData);
      setDriftRows(auditData.driftRows ?? []);
      setDriftMeta({
        totalUsers: auditData.totalUsers,
        cleanUsers: auditData.cleanUsers,
        checkedAt: auditData.checkedAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [loadLedger, loadAudits]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab !== "audits") return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [tab, load]);

  async function syncLedger(email: string) {
    setSyncingEmail(email);
    setSyncMsg(null);
    try {
      const res = await fetch(`${API_BASE}/admin/balance-monitor/fix`, {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as { message?: string }).message ?? "Sync failed");
      setSyncMsg(`Synced ${email}`);
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncingEmail(null);
    }
  }

  async function runReconcile(e: React.FormEvent) {
    e.preventDefault();
    setReconcileBusy(true);
    setReconcileResult(null);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (lookupUserId.trim()) params.set("userId", lookupUserId.trim());
      else if (lookupEmail.trim()) params.set("email", lookupEmail.trim());
      else throw new Error("Enter email or user ID");
      const res = await fetch(`${API_BASE}/admin/wallet-reconcile?${params}`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const j = (await res.json()) as ReconcileResult;
      if (!res.ok) throw new Error(j.message ?? "Reconcile failed");
      setReconcileResult(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconcile failed");
    } finally {
      setReconcileBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "ledger", label: "Wallet Ledger" },
    { id: "audits", label: "Balance Audits" },
    { id: "reconcile", label: "Reconciliation" },
  ];

  return (
    <div className="p-4 tablet:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Wallet &amp; Balances</h1>
        <p className="text-sm text-fintech-muted mt-1">USD wallet ledger, drift audits, and per-user reconciliation.</p>
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
      {loading && !stats ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : (
        <>
          {tab === "ledger" && stats && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="card-lux p-4">
                  <p className="text-sm text-fintech-muted">Total deposits</p>
                  <p className="text-2xl font-bold text-white">{formatCents(stats.totalDepositsCents)}</p>
                </div>
                <div className="card-lux p-4">
                  <p className="text-sm text-fintech-muted">Withdrawal debits</p>
                  <p className="text-2xl font-bold text-white">{formatCents(stats.totalWithdrawalsCents)}</p>
                </div>
                <div className="card-lux p-4">
                  <p className="text-sm text-fintech-muted">User balances</p>
                  <p className="text-2xl font-bold text-white">{formatCents(stats.totalBalanceCents)}</p>
                </div>
                <div className="card-lux p-4">
                  <p className="text-sm text-fintech-muted">Ledger surplus</p>
                  <p className="text-2xl font-bold text-emerald-400">{formatCents(stats.ledgerSurplusCents)}</p>
                </div>
              </div>
              <div className="card-lux overflow-hidden">
                <h2 className="p-4 text-lg font-bold text-white border-b border-white/10">Top balances</h2>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-fintech-muted">
                      <th className="p-3">User</th>
                      <th className="p-3">Balance</th>
                      <th className="p-3">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.userBalances ?? []).map((row) => (
                      <tr key={row.user_id} className="border-b border-white/5 text-white">
                        <td className="p-3 font-mono text-xs">{row.email ?? row.user_id.slice(0, 8)}</td>
                        <td className="p-3">{formatCents(row.balance_cents)}</td>
                        <td className="p-3 text-fintech-muted">
                          {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "audits" && (
            <div className="space-y-4">
              {driftMeta.checkedAt && (
                <p className="text-xs text-fintech-muted">
                  Last checked: {new Date(driftMeta.checkedAt).toLocaleString()} · auto-refresh 60s
                </p>
              )}
              {syncMsg && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">{syncMsg}</div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="card-lux p-4">
                  <p className="text-xs text-fintech-muted">Total users</p>
                  <p className="text-2xl font-bold text-white">{driftMeta.totalUsers}</p>
                </div>
                <div className="card-lux p-4 border border-emerald-500/25">
                  <p className="text-xs text-emerald-200/80">Clean</p>
                  <p className="text-2xl font-bold text-emerald-100">{driftMeta.cleanUsers}</p>
                </div>
                <div className="card-lux p-4 border border-amber-500/25">
                  <p className="text-xs text-amber-200/80">Drifted</p>
                  <p className="text-2xl font-bold text-amber-100">{driftRows.length}</p>
                </div>
              </div>
              {driftRows.length === 0 ? (
                <div className="card-lux p-8 text-center text-emerald-200">All balances clean</div>
              ) : (
                <div className="card-lux overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[640px]">
                    <thead>
                      <tr className="border-b border-white/10 text-fintech-muted">
                        <th className="p-3">Email</th>
                        <th className="p-3">wallet_balances</th>
                        <th className="p-3">ledger_latest</th>
                        <th className="p-3">Drift</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {driftRows.map((row, i) => (
                        <tr key={`${row.email}-${i}`} className="border-b border-white/5 text-white">
                          <td className="p-3 font-mono text-xs">{row.email}</td>
                          <td className="p-3">{formatCents(row.wallet_balances_cents)}</td>
                          <td className="p-3">{formatCents(row.ledger_latest_cents)}</td>
                          <td className="p-3 text-amber-200">{formatCents(row.drift_cents)}</td>
                          <td className="p-3">
                            <ActionButton
                              onClick={() => void syncLedger(row.email)}
                              disabled={syncingEmail === row.email}
                            >
                              {syncingEmail === row.email ? "…" : "Sync"}
                            </ActionButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "reconcile" && (
            <div className="max-w-lg space-y-4">
              <form onSubmit={runReconcile} className="card-lux p-4 space-y-3">
                <div>
                  <label className="text-xs text-fintech-muted">Email</label>
                  <input
                    value={lookupEmail}
                    onChange={(e) => setLookupEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-fintech-muted">Or user ID</label>
                  <input
                    value={lookupUserId}
                    onChange={(e) => setLookupUserId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <ActionButton type="submit" disabled={reconcileBusy}>
                  {reconcileBusy ? "Looking up…" : "Reconcile"}
                </ActionButton>
              </form>
              {reconcileResult?.ok && (
                <div className="card-lux p-4 text-sm space-y-2 text-white">
                  <p className="font-mono text-xs text-fintech-muted">User {reconcileResult.userId}</p>
                  <p>Deposits: {formatCents(reconcileResult.depositsTotalCents)}</p>
                  <p>Earnings: {formatCents(reconcileResult.earningsTotalCents)}</p>
                  <p>Withdrawals: {formatCents(reconcileResult.withdrawalsTotalCents)}</p>
                  <p>Admin credits: {formatCents(reconcileResult.adminCreditsTotalCents)}</p>
                  <p>Game play: {formatCents(reconcileResult.gamePlayTotalCents)}</p>
                  <p>Wallet row: {formatCents(reconcileResult.walletBalancesRowCents)}</p>
                  <p>Ledger available: {formatCents(reconcileResult.ledgerDerivedAvailableCents)}</p>
                  <p className="text-amber-200">
                    Drift: {formatCents(reconcileResult.driftWalletBalancesMinusLedgerCents)}
                  </p>
                  {reconcileResult.formulaNote && (
                    <p className="text-xs text-fintech-muted pt-2">{reconcileResult.formulaNote}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminWalletPage() {
  return (
    <AdminPageGate>
      <AdminWalletInner />
    </AdminPageGate>
  );
}
