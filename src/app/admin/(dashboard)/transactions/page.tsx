"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type TxRow = {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  description?: string | null;
  created_at: string;
  user_email?: string;
};

function formatUsdCents(cents: number) {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

export default function AdminTransactionsPage() {
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
    setError(null);
    fetch(`${API_BASE}/admin/transactions`, { credentials: "include", headers: adminApiHeaders(session) })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: { transactions?: TxRow[] } | TxRow[]) => {
        const raw = data as { transactions?: TxRow[] };
        const list = Array.isArray(data) ? (data as TxRow[]) : raw.transactions ?? [];
        setTransactions(list);
      })
      .catch(() => setError("Failed to load transactions"))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="py-6">
      <h1 className="text-2xl font-bold text-white mb-2">Transactions</h1>
      <p className="text-[#9ca3af] mb-6">All user transactions (amounts in USD cents).</p>
      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>}
      {loading ? (
        <div className="text-[#9ca3af]">Loading…</div>
      ) : transactions.length === 0 ? (
        <div className="text-[#9ca3af]">No transactions.</div>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
          <AdminScrollHint />
          <AdminTableWrap>
            <table className="w-full text-left text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-[#9ca3af] font-medium">Date</th>
                  <th className="p-3 text-[#9ca3af] font-medium">User</th>
                  <th className="p-3 text-[#9ca3af] font-medium">Type</th>
                  <th className="p-3 text-[#9ca3af] font-medium">Status</th>
                  <th className="p-3 text-[#9ca3af] font-medium text-right">Amount</th>
                  <th className="p-3 text-[#9ca3af] font-medium hidden lg:table-cell">Description</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="p-3 text-[#9ca3af] whitespace-nowrap">
                      {t.created_at ? new Date(t.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="p-3 text-white max-w-[200px] truncate" title={t.user_email ?? t.user_id}>
                      {t.user_email ?? t.user_id}
                    </td>
                    <td className="p-3 text-[#9ca3af] capitalize">{t.type}</td>
                    <td className="p-3 text-[#9ca3af] capitalize">{t.status}</td>
                    <td className="p-3 text-right font-medium text-white">{formatUsdCents(t.amount)}</td>
                    <td className="p-3 text-[#9ca3af] hidden lg:table-cell max-w-xs truncate">{t.description ?? "—"}</td>
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
