"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type TxRow = {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  description?: string | null;
  created_at: string;
};

export default function AdminRewardsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/transactions`, {
      headers: {
        "X-Admin-Id": session.adminId,
        ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: TxRow[] | { transactions?: TxRow[] }) => {
        const list = Array.isArray(data)
          ? data
          : Array.isArray((data as { transactions?: TxRow[] }).transactions)
            ? (data as { transactions: TxRow[] }).transactions
            : [];
        setTransactions(list.filter((t) => t.type === "reward" || t.type === "earning"));
      })
      .catch(() => setError("Failed to load reward activity"))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Rewards</h1>
      <p className="text-[#9ca3af] mb-6">Reward credits (ad views, etc.) recorded as transactions.</p>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {loading ? (
        <div className="text-[#9ca3af]">Loading…</div>
      ) : transactions.length === 0 ? (
        <div className="text-[#9ca3af]">No reward transactions.</div>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">User ID</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Amount</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Description</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Status</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="p-3 text-white font-mono text-sm">{t.user_id}</td>
                    <td className="p-3 text-white">${Number(t.amount).toFixed(2)}</td>
                    <td className="p-3 text-[#9ca3af]">{t.description ?? "—"}</td>
                    <td className="p-3 text-[#9ca3af]">{t.status}</td>
                    <td className="p-3 text-[#9ca3af] text-sm">{new Date(t.created_at).toLocaleString()}</td>
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
