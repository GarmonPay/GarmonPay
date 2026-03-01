"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";
import { buildAdminAuthHeaders } from "@/lib/admin-request";

type UserRow = {
  id: string;
  email: string | null;
  role?: string;
  balance?: number;
  total_deposits?: number;
  total_withdrawals?: number;
  total_earnings?: number;
  is_banned?: boolean;
  is_super_admin?: boolean;
  banned_reason?: string | null;
  created_at?: string;
};

export default function AdminUsersPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addFundsUser, setAddFundsUser] = useState<UserRow | null>(null);
  const [addFundsMode, setAddFundsMode] = useState<"add" | "subtract">("add");
  const [addFundsAmount, setAddFundsAmount] = useState("");
  const [addFundsSubmitting, setAddFundsSubmitting] = useState(false);
  const [addFundsError, setAddFundsError] = useState("");
  const [banUpdatingId, setBanUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load depends on session, run once when session is set
  }, [session]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        headers: buildAdminAuthHeaders(session!),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to load users");
        setUsers([]);
        return;
      }
      setUsers((data.users ?? []) as UserRow[]);
    } catch (e) {
      console.error("Admin users load error:", e);
      setError("Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

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
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: buildAdminAuthHeaders(session, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          userId: addFundsUser.id,
          action: addFundsMode === "add" ? "add_funds" : "subtract_funds",
          amount,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddFundsError(data.message || "Failed to update wallet");
        return;
      }
      setAddFundsUser(null);
      setAddFundsAmount("");
      load();
    } finally {
      setAddFundsSubmitting(false);
    }
  }

  async function toggleBan(user: UserRow) {
    if (!session) return;
    setError("");
    setBanUpdatingId(user.id);
    try {
      const action = user.is_banned ? "unban" : "ban";
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: buildAdminAuthHeaders(session, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          userId: user.id,
          action,
          reason: user.is_banned ? undefined : "Banned by admin",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to update user status");
        return;
      }
      load();
    } finally {
      setBanUpdatingId(null);
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
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Deposits</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Withdrawals</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Earnings</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Status</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Joined</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-white font-medium truncate max-w-[200px]">{u.email ?? "—"}</td>
                    <td className="py-3 pr-4 text-[#9ca3af] capitalize">{u.role ?? "user"}</td>
                    <td className="py-3 pr-4 text-[#10b981]">
                      ${typeof u.balance === "number" ? (u.balance / 100).toFixed(2) : "0.00"}
                    </td>
                    <td className="py-3 pr-4 text-[#9ca3af]">
                      ${typeof u.total_deposits === "number" ? (u.total_deposits / 100).toFixed(2) : "0.00"}
                    </td>
                    <td className="py-3 pr-4 text-[#9ca3af]">
                      ${typeof u.total_withdrawals === "number" ? (u.total_withdrawals / 100).toFixed(2) : "0.00"}
                    </td>
                    <td className="py-3 pr-4 text-[#9ca3af]">
                      ${typeof u.total_earnings === "number" ? (u.total_earnings / 100).toFixed(2) : "0.00"}
                    </td>
                    <td className="py-3 pr-4">
                      {u.is_banned ? (
                        <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300">Banned</span>
                      ) : u.is_super_admin ? (
                        <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300">Super admin</span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-300">Active</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-[#6b7280]">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAddFundsMode("add");
                            setAddFundsUser(u);
                            setAddFundsAmount("");
                            setAddFundsError("");
                          }}
                          disabled={!!u.is_super_admin}
                          className="text-xs px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddFundsMode("subtract");
                            setAddFundsUser(u);
                            setAddFundsAmount("");
                            setAddFundsError("");
                          }}
                          disabled={!!u.is_super_admin}
                          className="text-xs px-2 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white"
                        >
                          Subtract
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleBan(u)}
                          disabled={banUpdatingId === u.id || !!u.is_super_admin}
                          className={`text-xs px-2 py-1 rounded text-white ${
                            u.is_banned
                              ? "bg-emerald-600 hover:bg-emerald-500"
                              : "bg-red-600 hover:bg-red-500"
                          } disabled:opacity-50`}
                        >
                          {banUpdatingId === u.id
                            ? "Saving…"
                            : u.is_banned
                              ? "Unban"
                              : "Ban"}
                        </button>
                      </div>
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
            <h3 className="text-lg font-semibold text-white mb-1">
              {addFundsMode === "add" ? "Add funds" : "Subtract funds"}
            </h3>
            <p className="text-sm text-[#9ca3af] mb-4 truncate">{addFundsUser.email ?? addFundsUser.id}</p>
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
            {addFundsError && <p className="text-sm text-red-400 mb-4">{addFundsError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitAddFunds}
                disabled={addFundsSubmitting}
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium"
              >
                {addFundsSubmitting
                  ? addFundsMode === "add"
                    ? "Adding…"
                    : "Subtracting…"
                  : addFundsMode === "add"
                    ? "Add"
                    : "Subtract"}
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
