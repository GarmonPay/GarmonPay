"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";
import { buildAdminAuthHeaders } from "@/lib/admin-request";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type DepositRow = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
};

type EarningRow = {
  id: string;
  user_id: string;
  amount: number;
  source: string;
  created_at: string;
};

type EarningsResponse = {
  summary: {
    totalDepositsCents: number;
    totalWithdrawalsCents: number;
    totalEarningsCents: number;
    totalPlatformRevenueCents: number;
    totalProfitCents: number;
  };
  deposits: DepositRow[];
  earnings: EarningRow[];
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminEarningsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/admin/earnings`, {
      headers: buildAdminAuthHeaders(session),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || "Failed to load earnings");
        return body as EarningsResponse;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load earnings"))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-[#9ca3af]">
        Loading earnings…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Earnings</h1>
      <p className="text-[#9ca3af] mb-6">
        Deposits, earnings, and platform profit overview from live transaction data.
      </p>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
              <p className="text-xs text-[#9ca3af] uppercase">Deposits</p>
              <p className="text-2xl font-bold text-white mt-2">
                {formatCents(data.summary.totalDepositsCents)}
              </p>
            </div>
            <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
              <p className="text-xs text-[#9ca3af] uppercase">Withdrawals</p>
              <p className="text-2xl font-bold text-white mt-2">
                {formatCents(data.summary.totalWithdrawalsCents)}
              </p>
            </div>
            <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
              <p className="text-xs text-[#9ca3af] uppercase">User earnings</p>
              <p className="text-2xl font-bold text-[#10b981] mt-2">
                {formatCents(data.summary.totalEarningsCents)}
              </p>
            </div>
            <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
              <p className="text-xs text-[#9ca3af] uppercase">Platform revenue</p>
              <p className="text-2xl font-bold text-[#10b981] mt-2">
                {formatCents(data.summary.totalPlatformRevenueCents)}
              </p>
            </div>
            <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
              <p className="text-xs text-[#9ca3af] uppercase">Platform profit</p>
              <p className="text-2xl font-bold text-white mt-2">
                {formatCents(data.summary.totalProfitCents)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <section className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
              <h2 className="p-4 border-b border-white/10 text-white font-semibold">Recent deposits</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="p-3 text-[#9ca3af]">User</th>
                      <th className="p-3 text-[#9ca3af]">Amount</th>
                      <th className="p-3 text-[#9ca3af]">Status</th>
                      <th className="p-3 text-[#9ca3af]">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deposits.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-[#9ca3af]">
                          No deposits yet.
                        </td>
                      </tr>
                    ) : (
                      data.deposits.slice(0, 25).map((row) => (
                        <tr key={row.id} className="border-b border-white/5">
                          <td className="p-3 text-white font-mono text-xs">{row.user_id}</td>
                          <td className="p-3 text-white">{formatCents(row.amount)}</td>
                          <td className="p-3 text-[#9ca3af] capitalize">{row.status}</td>
                          <td className="p-3 text-[#9ca3af]">
                            {new Date(row.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
              <h2 className="p-4 border-b border-white/10 text-white font-semibold">Recent earnings</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="p-3 text-[#9ca3af]">User</th>
                      <th className="p-3 text-[#9ca3af]">Source</th>
                      <th className="p-3 text-[#9ca3af]">Amount</th>
                      <th className="p-3 text-[#9ca3af]">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.earnings.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-[#9ca3af]">
                          No earnings yet.
                        </td>
                      </tr>
                    ) : (
                      data.earnings.slice(0, 25).map((row) => (
                        <tr key={row.id} className="border-b border-white/5">
                          <td className="p-3 text-white font-mono text-xs">{row.user_id}</td>
                          <td className="p-3 text-[#9ca3af]">{row.source}</td>
                          <td className="p-3 text-[#10b981]">{formatCents(row.amount)}</td>
                          <td className="p-3 text-[#9ca3af]">
                            {new Date(row.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
