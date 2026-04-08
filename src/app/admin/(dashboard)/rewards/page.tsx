"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

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
    fetch(`${API_BASE}/admin/transactions`, { credentials: "include", headers: adminApiHeaders(session) })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: TxRow[] | { transactions?: TxRow[] }) => {
        const list = Array.isArray(data) ? data : data.transactions ?? [];
        setTransactions(
          list.filter((t) => ["earning", "referral", "referral_commission"].includes(t.type))
        );
      })
      .catch(() => setError("Failed to load reward activity"))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-2">Rewards</h1>
      <p className="text-fintech-muted mb-6">
        Earning-type transactions (earning, referral, referral_commission). Amounts are USD cents.
      </p>
      {!session ? (
        <div className="text-fintech-muted">Redirecting to admin login…</div>
      ) : (
        <>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {loading ? (
        <div className="text-fintech-muted">Loading…</div>
      ) : transactions.length === 0 ? (
        <div className="text-fintech-muted">No reward transactions.</div>
      ) : (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-sm font-medium text-fintech-muted">User ID</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Amount</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Description</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Status</th>
                  <th className="p-3 text-sm font-medium text-fintech-muted">Date</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-white/5">
                    <td className="p-3 text-white font-mono text-sm">{t.user_id}</td>
                    <td className="p-3 text-white">${(Number(t.amount) / 100).toFixed(2)}</td>
                    <td className="p-3 text-fintech-muted">{t.description ?? "—"}</td>
                    <td className="p-3 text-fintech-muted">{t.status}</td>
                    <td className="p-3 text-fintech-muted text-sm">{new Date(t.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
