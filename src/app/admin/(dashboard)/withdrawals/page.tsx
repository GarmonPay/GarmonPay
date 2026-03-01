"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";
import { adminBackendFetch } from "@/lib/admin-backend-api";

type WithdrawalRow = {
  id: string;
  userId: string;
  userEmail: string;
  amount: number;
  status: string;
  paymentMethod: string;
  adminNote?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  processedBy?: string | null;
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminBackendFetch<{ withdrawals: WithdrawalRow[] }>(
        "/admin/withdrawals?limit=300&offset=0"
      );
      setWithdrawals(data.withdrawals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load withdrawals");
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load();
  }, [session, load]);

  async function updateStatus(id: string, status: string) {
    if (!session) return;
    setActionError(null);
    setUpdatingId(id);
    try {
      await adminBackendFetch<{ ok: boolean }>(`/admin/withdrawals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Withdrawals</h1>
      <p className="text-[#9ca3af] mb-6">
        Review and approve, reject, or mark as paid. Rejecting refunds the user&apos;s balance.
      </p>
      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{actionError}</div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {loading ? (
        <div className="text-[#9ca3af]">Loading…</div>
      ) : withdrawals.length === 0 ? (
        <div className="text-[#9ca3af]">No withdrawal requests.</div>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">User</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Amount</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Method</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Admin note</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Status</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Date</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-white/5">
                    <td className="p-3 text-white">{w.userEmail || w.userId}</td>
                    <td className="p-3 text-white font-medium">{formatCents(w.amount)}</td>
                    <td className="p-3 text-[#9ca3af] capitalize">{w.paymentMethod}</td>
                    <td className="p-3 text-[#9ca3af] text-sm max-w-xs truncate" title={w.adminNote ?? ""}>
                      {w.adminNote || "—"}
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
                    <td className="p-3 text-[#9ca3af] text-sm">{formatDate(w.requestedAt)}</td>
                    <td className="p-3">
                      {w.status === "pending" && (
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => updateStatus(w.id, "approved")}
                            disabled={updatingId === w.id}
                            className="px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-500 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(w.id, "rejected")}
                            disabled={updatingId === w.id}
                            className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-500 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {w.status === "approved" && (
                        <button
                          type="button"
                          onClick={() => updateStatus(w.id, "paid")}
                          disabled={updatingId === w.id}
                          className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 disabled:opacity-50"
                        >
                          Mark paid
                        </button>
                      )}
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
