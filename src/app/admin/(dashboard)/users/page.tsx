"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";
import { adminBackendFetch } from "@/lib/admin-backend-api";

type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  createdAt: string;
  wallet: {
    balance: number;
    rewardsEarned: number;
    totalWithdrawn: number;
    updatedAt: string;
  };
};

export default function AdminUsersPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addFundsUser, setAddFundsUser] = useState<AdminUserRow | null>(null);
  const [addFundsAmount, setAddFundsAmount] = useState("");
  const [addFundsReason, setAddFundsReason] = useState("Manual admin credit");
  const [addFundsSubmitting, setAddFundsSubmitting] = useState(false);
  const [addFundsError, setAddFundsError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminBackendFetch<{ users: AdminUserRow[] }>("/admin/users?limit=300&offset=0");
      setUsers(data.users ?? []);
    } catch (e) {
      console.error("Admin users load error:", e);
      setError(e instanceof Error ? e.message : "Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void load();
  }, [session, load]);

  async function submitAddFunds() {
    if (!addFundsUser || !session) return;
    const amount = parseFloat(addFundsAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setAddFundsError("Enter a valid amount (e.g. 10.00)");
      return;
    }
    setAddFundsError("");
    setAddFundsSubmitting(true);
    try {
      await adminBackendFetch<{ ok: boolean }>("/admin/wallets/credit", {
        method: "POST",
        body: JSON.stringify({
          userId: addFundsUser.id,
          amount: Math.round(amount * 100),
          reason: addFundsReason.trim() || "Manual admin credit",
        }),
      });
      setAddFundsUser(null);
      setAddFundsAmount("");
      setAddFundsReason("Manual admin credit");
      void load();
    } catch (e) {
      setAddFundsError(e instanceof Error ? e.message : "Failed to add funds");
    } finally {
      setAddFundsSubmitting(false);
    }
  }

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          (u.email ?? "").toLowerCase().includes(search.trim().toLowerCase()) ||
          (u.id ?? "").toLowerCase().includes(search.trim().toLowerCase())
      )
    : users;

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-[#9ca3af]">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Users</h1>
      <p className="text-[#9ca3af] mb-6">User management. List and manage registered users.</p>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        <div className="mb-4">
          <input
            type="search"
            placeholder="Search by email or user ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280]"
          />
        </div>

      {loading ? (
        <p className="text-[#9ca3af]">Loading users…</p>
      ) : error ? (
        <p className="text-red-400">{error}</p>
      ) : filtered.length === 0 ? (
          <p className="text-[#9ca3af]">
            {users.length === 0
              ? "No users yet."
              : `No users match "${search.trim()}".`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Email</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Role</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Balance</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Rewards</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Joined</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-white font-medium truncate max-w-[220px]">{u.email || "—"}</td>
                    <td className="py-3 pr-4 text-[#9ca3af] capitalize">
                      {u.role || "user"}
                      {u.isSuperAdmin ? " (super)" : ""}
                    </td>
                    <td className="py-3 pr-4 text-[#10b981]">
                      ${((u.wallet?.balance ?? 0) / 100).toFixed(2)}
                    </td>
                    <td className="py-3 pr-4 text-white">
                      ${((u.wallet?.rewardsEarned ?? 0) / 100).toFixed(2)}
                    </td>
                    <td className="py-3 pr-4 text-[#6b7280]">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => {
                          setAddFundsUser(u);
                          setAddFundsAmount("");
                          setAddFundsReason("Manual admin credit");
                          setAddFundsError("");
                        }}
                        className="text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        Add funds
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && users.length > 0 && (
          <p className="mt-4 text-xs text-[#6b7280]">
            Showing {filtered.length} of {users.length} user{users.length !== 1 ? "s" : ""}.
          </p>
        )}
      </div>

      {addFundsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !addFundsSubmitting && setAddFundsUser(null)}>
          <div className="rounded-xl bg-[#111827] border border-white/10 p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-1">Add funds</h3>
            <p className="text-sm text-[#9ca3af] mb-4 truncate">{addFundsUser.email || addFundsUser.id}</p>
            <label className="block text-sm text-[#9ca3af] mb-1">Amount (USD)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="e.g. 10.00"
              value={addFundsAmount}
              onChange={(e) => setAddFundsAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280] mb-4"
            />
            <label className="block text-sm text-[#9ca3af] mb-1">Reason</label>
            <input
              type="text"
              value={addFundsReason}
              onChange={(e) => setAddFundsReason(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-[#6b7280] mb-4"
              placeholder="Manual admin credit"
            />
            {addFundsError && <p className="text-sm text-red-400 mb-4">{addFundsError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitAddFunds}
                disabled={addFundsSubmitting}
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium"
              >
                {addFundsSubmitting ? "Adding…" : "Add"}
              </button>
              <button
                type="button"
                onClick={() => setAddFundsUser(null)}
                disabled={addFundsSubmitting}
                className="px-4 py-2 rounded-lg border border-white/20 text-[#9ca3af] hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
