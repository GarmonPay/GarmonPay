"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";

const API_BASE = getApiRoot();

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

const PAGE_SIZE = 100;

function AdminTransactionsInner() {
  const session = useAdminSession();
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (nextOffset === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });
        const res = await fetch(`${API_BASE}/admin/transactions?${params}`, {
          credentials: "include",
          headers: adminApiHeaders(session),
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as { transactions?: TxRow[] };
        const list = data.transactions ?? [];
        setHasMore(list.length >= PAGE_SIZE);
        setOffset(nextOffset + list.length);
        if (append) {
          setTransactions((prev) => [...prev, ...list]);
        } else {
          setTransactions(list);
        }
      } catch {
        setError("Failed to load transactions");
        if (!append) setTransactions([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [session]
  );

  useEffect(() => {
    void fetchPage(0, false);
  }, [fetchPage]);

  return (
    <div className="py-6">
      <h1 className="font-[family-name:var(--font-admin-display)] text-xl font-bold text-white mb-2">
        Transactions
      </h1>
      <p className="text-white/60 mb-6">User transactions (amounts in USD cents). Loads {PAGE_SIZE} at a time.</p>
      {error && <div className="mb-4 rounded-lg bg-red-500/20 p-3 text-sm text-red-400">{error}</div>}
      {loading ? (
        <div className="text-white/60">Loading…</div>
      ) : error ? null : transactions.length === 0 ? (
        <div className="text-white/60">No transactions.</div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0e0118]/80">
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="p-3 font-medium text-white/50">Date</th>
                    <th className="p-3 font-medium text-white/50">User</th>
                    <th className="p-3 font-medium text-white/50">Type</th>
                    <th className="p-3 font-medium text-white/50">Status</th>
                    <th className="p-3 text-right font-medium text-white/50">Amount</th>
                    <th className="hidden p-3 font-medium text-white/50 lg:table-cell">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-white/5">
                      <td className="whitespace-nowrap p-3 text-white/55">
                        {t.created_at ? new Date(t.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="max-w-[200px] truncate p-3 text-white" title={t.user_email ?? t.user_id}>
                        {t.user_email ?? t.user_id}
                      </td>
                      <td className="p-3 capitalize text-white/55">{t.type}</td>
                      <td className="p-3 capitalize text-white/55">{t.status}</td>
                      <td className="p-3 text-right font-medium text-white">{formatUsdCents(t.amount)}</td>
                      <td className="hidden max-w-xs truncate p-3 text-white/55 lg:table-cell">{t.description ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <ActionButton
                variant="primary"
                disabled={loadingMore}
                onClick={() => void fetchPage(offset, true)}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </ActionButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminTransactionsPage() {
  return (
    <AdminPageGate>
      <AdminTransactionsInner />
    </AdminPageGate>
  );
}
