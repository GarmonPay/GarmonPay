"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";

type DepositRow = {
  id: string;
  user_id: string;
  user_email?: string | null;
  amount: number;
  status?: string;
  stripe_session?: string | null;
  created_at: string;
};

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminDepositsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    fetch("/api/admin/deposits", {
      headers: {
        "X-Admin-Id": session.adminId,
        ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { message?: string }).message ?? "Failed to load deposits");
        return data as { deposits?: DepositRow[] };
      })
      .then((data) => setDeposits(data.deposits ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load deposits"))
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
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Deposits</h1>
      <p className="text-[#9ca3af] mb-6">All completed and pending wallet deposit records.</p>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        {loading ? (
          <p className="text-[#9ca3af]">Loading deposits…</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : deposits.length === 0 ? (
          <p className="text-[#9ca3af]">No deposits found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">User</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Amount</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Status</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Stripe Session</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-white truncate max-w-[220px]">
                      {d.user_email ?? d.user_id}
                    </td>
                    <td className="py-3 pr-4 text-[#10b981] font-medium">{formatCents(Number(d.amount ?? 0))}</td>
                    <td className="py-3 pr-4 text-[#9ca3af] capitalize">{d.status ?? "completed"}</td>
                    <td className="py-3 pr-4 text-[#6b7280] font-mono text-xs truncate max-w-[220px]">
                      {d.stripe_session ?? "—"}
                    </td>
                    <td className="py-3 pr-4 text-[#9ca3af]">
                      {d.created_at ? new Date(d.created_at).toLocaleString() : "—"}
                    </td>
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
