"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";

type TxRow = {
  id: string;
  user_id: string;
  user_email?: string;
  type: string;
  amount: number;
  status: string;
  description?: string | null;
  created_at: string;
};

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminTransactionsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    fetch("/api/admin/transactions", {
      headers: {
        "X-Admin-Id": session.adminId,
        ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { message?: string }).message ?? "Failed to load transactions");
        return data as { transactions?: TxRow[] };
      })
      .then((data) => setTransactions(data.transactions ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load transactions"))
      .finally(() => setLoading(false));
  }, [session]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((t) => {
      return (
        (t.user_email ?? "").toLowerCase().includes(q) ||
        (t.user_id ?? "").toLowerCase().includes(q) ||
        (t.type ?? "").toLowerCase().includes(q) ||
        (t.status ?? "").toLowerCase().includes(q)
      );
    });
  }, [transactions, search]);

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Transactions</h1>
      <p className="text-[#9ca3af] mb-6">Full platform transaction ledger.</p>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        <div className="mb-4">
          <input
            type="search"
            placeholder="Search by user, type, status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280]"
          />
        </div>
        {loading ? (
          <p className="text-[#9ca3af]">Loading transactions…</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-[#9ca3af]">No transactions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Date</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">User</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Type</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Status</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium text-right">Amount</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => (
                  <tr key={tx.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-[#9ca3af]">
                      {tx.created_at ? new Date(tx.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 pr-4 text-white truncate max-w-[220px]">
                      {tx.user_email ?? tx.user_id}
                    </td>
                    <td className="py-3 pr-4 text-[#9ca3af] capitalize">{tx.type}</td>
                    <td className="py-3 pr-4 text-[#9ca3af] capitalize">{tx.status}</td>
                    <td className="py-3 pr-4 text-right text-white font-medium">{formatCents(Number(tx.amount ?? 0))}</td>
                    <td className="py-3 pr-4 text-[#6b7280] truncate max-w-[320px]">{tx.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
