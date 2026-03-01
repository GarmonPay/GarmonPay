"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";
import { adminBackendFetch } from "@/lib/admin-backend-api";

type RewardRow = {
  id: string;
  userId: string;
  userEmail: string;
  amount: number;
  eventType: string;
  idempotencyKey?: string | null;
  createdAt: string;
};

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminRewardsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [rows, setRows] = useState<RewardRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminBackendFetch<{ rewards: RewardRow[] }>(
        "/admin/rewards?limit=400&offset=0"
      );
      setRows(data.rewards ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reward activity");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load();
  }, [session, load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.userEmail, row.userId, row.eventType, row.idempotencyKey ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.amount += Number(row.amount ?? 0);
        return acc;
      },
      { count: 0, amount: 0 }
    );
  }, [filtered]);

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Rewards</h1>
          <p className="text-[#9ca3af]">Reward credits issued from ad and earning events.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
          <p className="text-xs uppercase tracking-wider text-[#9ca3af]">Events</p>
          <p className="text-2xl text-white font-semibold mt-1">{totals.count}</p>
        </div>
        <div className="rounded-xl bg-[#111827] border border-white/10 p-4">
          <p className="text-xs uppercase tracking-wider text-[#9ca3af]">Total Credited</p>
          <p className="text-2xl text-[#10b981] font-semibold mt-1">{formatCurrency(totals.amount)}</p>
        </div>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by user, event type, or idempotency key…"
            className="w-full max-w-xl px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280]"
          />
        </div>

        {loading ? (
          <p className="text-[#9ca3af]">Loading reward activity…</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-[#9ca3af]">No reward events found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Date</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">User</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Event</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Idempotency</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-[#9ca3af]">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-white max-w-[220px] truncate">
                      {row.userEmail || row.userId}
                    </td>
                    <td className="py-3 pr-4 text-[#9ca3af]">{row.eventType}</td>
                    <td
                      className="py-3 pr-4 text-xs text-[#9ca3af] font-mono max-w-[260px] truncate"
                      title={row.idempotencyKey ?? ""}
                    >
                      {row.idempotencyKey || "—"}
                    </td>
                    <td className="py-3 pr-4 text-right text-[#10b981] font-medium">
                      {formatCurrency(row.amount)}
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
