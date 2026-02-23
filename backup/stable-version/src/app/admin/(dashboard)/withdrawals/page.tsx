"use client";

import { useEffect, useState } from "react";
import { getAdminSession } from "@/lib/admin-session";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type WithdrawalRow = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  method: string;
  wallet_address: string;
  created_at: string;
  user_email?: string;
};

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function AdminWithdrawalsPage() {
  const session = getAdminSession();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function load() {
    if (!session) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/withdrawals`, { headers: { "X-Admin-Id": session.adminId } })
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
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Id": session.adminId,
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
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Wallet / details</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Status</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Date</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-white/5">
                    <td className="p-3 text-white">{w.user_email ?? w.user_id}</td>
                    <td className="p-3 text-white font-medium">{formatCents(w.amount)}</td>
                    <td className="p-3 text-[#9ca3af] capitalize">{w.method}</td>
                    <td className="p-3 text-[#9ca3af] font-mono text-sm max-w-xs truncate" title={w.wallet_address}>
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
                    <td className="p-3 text-[#9ca3af] text-sm">{formatDate(w.created_at)}</td>
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
                          <button
                            type="button"
                            onClick={() => updateStatus(w.id, "paid")}
                            disabled={updatingId === w.id}
                            className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 disabled:opacity-50"
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
