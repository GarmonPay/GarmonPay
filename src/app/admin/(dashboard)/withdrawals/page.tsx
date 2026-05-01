"use client";

import { useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";

const API_BASE = getApiRoot();

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

function AdminWithdrawalsInner() {
  const session = useAdminSession();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
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
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-admin-display)] text-xl font-bold text-white mb-2">
            Withdrawals
          </h1>
          <p className="text-white/60">
            Approve, reject, or mark paid via PATCH /api/admin/withdrawals (RPC). Rejecting refunds balance.
          </p>
        </div>
      </div>
      {actionError && (
        <div className="mb-4 rounded-lg bg-red-500/20 p-3 text-sm text-red-400">{actionError}</div>
      )}
      {error && <div className="mb-4 rounded-lg bg-red-500/20 p-3 text-sm text-red-400">{error}</div>}
      {loading ? (
        <div className="text-white/60">Loading…</div>
      ) : error ? null : withdrawals.length === 0 ? (
        <div className="text-white/60">No withdrawal requests.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0e0118]/80">
          <AdminScrollHint />
          <AdminTableWrap>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-sm font-medium text-white/50">User</th>
                  <th className="p-3 text-sm font-medium text-white/50">Amount</th>
                  <th className="hidden p-3 text-sm font-medium text-white/50 sm:table-cell">Fee</th>
                  <th className="hidden p-3 text-sm font-medium text-white/50 sm:table-cell">Net</th>
                  <th className="hidden p-3 text-sm font-medium text-white/50 sm:table-cell">Method</th>
                  <th className="hidden p-3 text-sm font-medium text-white/50 lg:table-cell">Wallet / details</th>
                  <th className="p-3 text-sm font-medium text-white/50">Status</th>
                  <th className="p-3 text-sm font-medium text-white/50">Date</th>
                  <th className="p-3 text-sm font-medium text-white/50">Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-white/5">
                    <td className="p-3 text-white">{w.user_email ?? w.user_id}</td>
                    <td className="p-3 font-medium text-white">{formatCents(w.amount)}</td>
                    <td className="hidden p-3 text-white/55 sm:table-cell">{formatCents(w.platform_fee ?? 0)}</td>
                    <td className="hidden p-3 text-white sm:table-cell">{formatCents(w.net_amount ?? w.amount)}</td>
                    <td className="hidden p-3 capitalize text-white/55 sm:table-cell">{w.method}</td>
                    <td
                      className="hidden max-w-xs truncate p-3 font-mono text-sm text-white/55 lg:table-cell"
                      title={w.wallet_address}
                    >
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
                    <td className="p-3 text-sm text-white/55">{formatDate(w.created_at)}</td>
                    <td className="p-3">
                      {w.status === "pending" && (
                        <div className="flex flex-wrap gap-2 max-[480px]:flex-col">
                          <ActionButton
                            variant="primary"
                            className="!bg-emerald-600 hover:!bg-emerald-500"
                            onClick={() => updateStatus(w.id, "approved")}
                            disabled={updatingId === w.id}
                          >
                            Approve
                          </ActionButton>
                          <ActionButton variant="danger" onClick={() => updateStatus(w.id, "rejected")} disabled={updatingId === w.id}>
                            Reject
                          </ActionButton>
                          <ActionButton variant="gold" onClick={() => updateStatus(w.id, "paid")} disabled={updatingId === w.id}>
                            Mark paid
                          </ActionButton>
                        </div>
                      )}
                      {w.status === "approved" && (
                        <ActionButton variant="gold" onClick={() => updateStatus(w.id, "paid")} disabled={updatingId === w.id}>
                          Mark paid
                        </ActionButton>
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

export default function AdminWithdrawalsPage() {
  return (
    <AdminPageGate>
      <AdminWithdrawalsInner />
    </AdminPageGate>
  );
}
