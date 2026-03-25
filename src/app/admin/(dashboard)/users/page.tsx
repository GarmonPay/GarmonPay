"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";

const ACTION_BTN =
  "inline-flex items-center justify-center min-h-[36px] min-w-[60px] px-3 py-2 rounded-lg text-sm font-medium transition max-[480px]:w-full max-[480px]:min-w-0";

type UserRow = {
  id: string;
  email: string | null;
  role?: string;
  balance?: number;
  banned?: boolean;
  banned_reason?: string | null;
  created_at?: string;
};

export default function AdminUsersPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addFundsUser, setAddFundsUser] = useState<UserRow | null>(null);
  const [addFundsAmount, setAddFundsAmount] = useState("");
  const [addFundsSubmitting, setAddFundsSubmitting] = useState(false);
  const [addFundsError, setAddFundsError] = useState("");
  const [banSubmitting, setBanSubmitting] = useState<string | null>(null);
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
        headers: adminApiHeaders(session),
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
      const res = await fetch("/api/admin/add-funds", {
        method: "POST",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ userId: addFundsUser.id, amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddFundsError(data.message || "Failed to add funds");
        return;
      }
      setAddFundsUser(null);
      setAddFundsAmount("");
      load();
    } finally {
      setAddFundsSubmitting(false);
    }
  }

  async function submitBan(u: UserRow, banned: boolean) {
    if (!session) return;
    setBanSubmitting(u.id);
    try {
      const res = await fetch("/api/admin/ban", {
        method: "POST",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, banned, reason: banned ? "Banned from admin" : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to update ban");
        return;
      }
      load();
    } finally {
      setBanSubmitting(null);
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
    <div className="py-6">
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
          <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Email</th>
                    <th className="pb-2 pr-4 text-[#9ca3af] font-medium hidden sm:table-cell">ID</th>
                    <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Role</th>
                    <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Balance</th>
                    <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Status</th>
                    <th className="pb-2 pr-4 text-[#9ca3af] font-medium hidden sm:table-cell">Joined</th>
                    <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white font-medium truncate max-w-[200px]">{u.email ?? "—"}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-[#6b7280] hidden sm:table-cell">{u.id.slice(0, 8)}…</td>
                      <td className="py-3 pr-4 text-[#9ca3af] capitalize">{u.role ?? "user"}</td>
                      <td className="py-3 pr-4 text-[#10b981]">
                        ${typeof u.balance === "number" ? (u.balance / 100).toFixed(2) : "0.00"}
                      </td>
                      <td className="py-3 pr-4">
                        {u.banned ? <span className="text-red-400 font-medium">Banned</span> : <span className="text-[#10b981]">Active</span>}
                      </td>
                      <td className="py-3 pr-4 text-[#6b7280] hidden sm:table-cell">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-2 max-[480px]:flex-col">
                          <button
                            type="button"
                            onClick={() => { setAddFundsUser(u); setAddFundsAmount(""); setAddFundsError(""); }}
                            className={`${ACTION_BTN} bg-indigo-600 hover:bg-indigo-500 text-white`}
                          >
                            Add funds
                          </button>
                          {u.banned ? (
                            <button
                              type="button"
                              onClick={() => submitBan(u, false)}
                              disabled={banSubmitting === u.id}
                              className={`${ACTION_BTN} bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50`}
                            >
                              {banSubmitting === u.id ? "…" : "Unban"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => submitBan(u, true)}
                              disabled={banSubmitting === u.id}
                              className={`${ACTION_BTN} bg-red-600 hover:bg-red-500 text-white disabled:opacity-50`}
                            >
                              {banSubmitting === u.id ? "…" : "Ban"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableWrap>
          </>
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
