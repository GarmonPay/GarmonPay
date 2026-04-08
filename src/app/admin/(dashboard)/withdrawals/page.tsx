"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";

const ACTION_BTN =
  "inline-flex items-center justify-center min-h-[36px] min-w-[60px] px-3 py-1.5 rounded-lg text-sm font-medium transition max-[480px]:w-full max-[480px]:min-w-0";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  platform_fee?: number;
  net_amount?: number;
  status: string;
  method: string;
  wallet_address: string;
  created_at: string;
  processed_at?: string | null;
  user_email?: string;
};

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function AdminWithdrawalsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  function load() {
    if (!session) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/withdrawals`, { credentials: "include", headers: adminApiHeaders(session) })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => setWithdrawals(data.withdrawals ?? []))
      .catch(() => setError("Failed to load withdrawals"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.adminId]);

  async function updateStatus(id: string, status: string) {
    if (!session) return;
    setActionError(null);
    setUpdatingId(id);
    try {
      const res = await fetch(`${API_BASE}/admin/withdrawals`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...adminApiHeaders(session),
        },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError((data.message as string) || "Action failed");
        return;
      }
      load();
    } catch {
      setActionError("Request failed");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white mb-2">Withdrawals</h1>
          <p className="text-fintech-muted">
            Review and approve, reject, or mark as paid. Rejecting refunds the user&apos;s balance.
          </p>
        </div>
      </div>
      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{actionError}</div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {loading ? (
        <div className="text-fintech-muted">Loading…</div>
      ) : withdrawals.length === 0 ? (
        <div className="text-fintech-muted">No withdrawal requests.</div>
      ) : (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
          <AdminScrollHint />
          <AdminTableWrap>
            <table className="w-full text-left min-w-[720px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-sm font-medium text-fintech-muted">User</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Amount</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted hidden sm:table-cell">Fee</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted hidden sm:table-cell">Net</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted hidden sm:table-cell">Method</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted hidden lg:table-cell">Wallet / details</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Status</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Date</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-white/5">
                    <td className="p-3 text-white">{w.user_email ?? w.user_id}</td>
                    <td className="p-3 text-white font-medium">{formatCents(w.amount)}</td>
                    <td className="p-3 text-fintech-muted hidden sm:table-cell">{formatCents(w.platform_fee ?? 0)}</td>
                    <td className="p-3 text-white hidden sm:table-cell">{formatCents(w.net_amount ?? w.amount)}</td>
                    <td className="p-3 text-fintech-muted capitalize hidden sm:table-cell">{w.method}</td>
                    <td className="p-3 text-fintech-muted font-mono text-sm max-w-xs truncate hidden lg:table-cell" title={w.wallet_address}>
                      {w.wallet_address}
                    </td>
                    <td className="p-3">
                      <span
                        className={
                          w.status === "pending"
                            ? "text-amber-400"
                            : w.status === "rejected"
                              ? "text-red-400"
                              : "text-green-400"
                        }
                      >
                        {w.status}
                      </span>
                    </td>
                    <td className="p-3 text-fintech-muted text-sm">{formatDate(w.created_at)}</td>
                    <td className="p-3">
                      {w.status === "pending" && (
                        <div className="flex flex-wrap gap-2 max-[480px]:flex-col">
                          <button
                            type="button"
                            onClick={() => updateStatus(w.id, "approved")}
                            disabled={updatingId === w.id}
                            className={`${ACTION_BTN} bg-green-600 text-white hover:bg-green-500 disabled:opacity-50`}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(w.id, "rejected")}
                            disabled={updatingId === w.id}
                            className={`${ACTION_BTN} bg-red-600 text-white hover:bg-red-500 disabled:opacity-50`}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(w.id, "paid")}
                            disabled={updatingId === w.id}
                            className={`${ACTION_BTN} bg-fintech-accent text-white hover:bg-fintech-accent/90 disabled:opacity-50`}
                          >
                            Mark paid
                          </button>
                        </div>
                      )}
                      {w.status === "approved" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(w.id, "paid")}
                          disabled={updatingId === w.id}
                          className={`${ACTION_BTN} bg-fintech-accent text-white hover:bg-fintech-accent/90 disabled:opacity-50`}
                        >
                          Mark paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </div>
      )}
    </div>
  );
}
