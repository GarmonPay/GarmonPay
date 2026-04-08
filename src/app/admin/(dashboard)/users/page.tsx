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
  /** Canonical USD cents from wallet_balances (or users.balance fallback). */
  usd_balance_cents?: number;
  gpay_available_minor?: number;
  gpay_lifetime_earned_minor?: number;
  banned?: boolean;
  banned_reason?: string | null;
  created_at?: string;
};

export default function AdminUsersPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [banSubmitting, setBanSubmitting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [credit, setCredit] = useState<null | { userId: string; email: string; kind: "usd" | "gpay" }>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);

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
        credentials: "include",
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

  async function submitCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !credit) return;
    const num = parseFloat(creditAmount);
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a positive amount");
      return;
    }
    const cents = Math.round(num * 100);
    setCreditBusy(true);
    setError("");
    try {
      const path = credit.kind === "usd" ? "/api/admin/users/credit-usd" : "/api/admin/users/credit-gpay";
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: credit.userId,
          amountCents: cents,
          reason: creditReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { message?: string }).message ?? "Credit failed");
        return;
      }
      setCredit(null);
      setCreditAmount("");
      setCreditReason("");
      load();
    } finally {
      setCreditBusy(false);
    }
  }

  async function submitBan(u: UserRow, banned: boolean) {
    if (!session) return;
    setBanSubmitting(u.id);
    try {
      const res = await fetch("/api/admin/ban", {
        method: "POST",
        credentials: "include",
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
      <div className="p-6 flex items-center justify-center min-h-[200px] text-fintech-muted">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="space-y-6 py-6">
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-4 tablet:p-6">
        <h1 className="text-xl font-bold text-white mb-2">Users</h1>
        <p className="text-sm text-fintech-muted mb-6">User management. List and manage registered users.</p>

        <div className="mb-4">
          <input
            type="search"
            placeholder="Search by email or user ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-fintech-muted"
          />
        </div>

        {loading ? (
        <p className="text-fintech-muted">Loading users…</p>
      ) : error ? (
        <p className="text-red-400">{error}</p>
      ) : filtered.length === 0 ? (
          <p className="text-fintech-muted">
            {users.length === 0
              ? "No users yet."
              : `No users match "${search.trim()}".`}
          </p>
        ) : (
          <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-white/10 bg-black/30">
                    <th className="p-3 pr-4 text-xs font-semibold text-fintech-muted uppercase">Email</th>
                    <th className="p-3 pr-4 text-xs font-semibold text-fintech-muted uppercase hidden sm:table-cell">ID</th>
                    <th className="p-3 pr-4 text-xs font-semibold text-fintech-muted uppercase">Role</th>
                    <th className="p-3 pr-4 text-xs font-semibold text-fintech-muted uppercase">USD (wallet)</th>
                    <th className="p-3 pr-4 text-xs font-semibold text-fintech-muted uppercase">GPay</th>
                    <th className="p-3 pr-4 text-xs font-semibold text-fintech-muted uppercase">Status</th>
                    <th className="p-3 pr-4 text-xs font-semibold text-fintech-muted uppercase hidden sm:table-cell">Joined</th>
                    <th className="p-3 pr-4 text-xs font-semibold text-fintech-muted uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="p-3 pr-4 text-sm text-white font-medium truncate max-w-[200px]">{u.email ?? "—"}</td>
                      <td className="p-3 pr-4 font-mono text-xs text-fintech-muted hidden sm:table-cell">{u.id.slice(0, 8)}…</td>
                      <td className="p-3 pr-4 text-sm text-fintech-muted capitalize">{u.role ?? "user"}</td>
                      <td className="p-3 pr-4 text-sm text-emerald-400">
                        $
                        {typeof u.usd_balance_cents === "number"
                          ? (u.usd_balance_cents / 100).toFixed(2)
                          : typeof u.balance === "number"
                            ? (u.balance / 100).toFixed(2)
                            : "0.00"}
                      </td>
                      <td className="p-3 pr-4 text-sm text-fintech-highlight">
                        {(u.gpay_available_minor ?? 0) / 100} GP
                        <span className="block text-[10px] text-fintech-muted">
                          life {(u.gpay_lifetime_earned_minor ?? 0) / 100}
                        </span>
                      </td>
                      <td className="p-3 pr-4">
                        {u.banned ? <span className="text-red-400 font-medium">Banned</span> : <span className="text-emerald-400">Active</span>}
                      </td>
                      <td className="p-3 pr-4 text-sm text-fintech-muted hidden sm:table-cell">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 pr-4">
                        <div className="flex flex-wrap gap-2 max-[480px]:flex-col">
                          <button
                            type="button"
                            onClick={() => {
                              setCredit({ userId: u.id, email: u.email ?? u.id, kind: "usd" });
                              setCreditAmount("");
                              setCreditReason("");
                            }}
                            className={`${ACTION_BTN} rounded-xl bg-fintech-accent hover:bg-fintech-accent/90 text-white`}
                          >
                            +USD
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCredit({ userId: u.id, email: u.email ?? u.id, kind: "gpay" });
                              setCreditAmount("");
                              setCreditReason("");
                            }}
                            className={`${ACTION_BTN} rounded-xl border border-fintech-highlight/40 bg-black/30 text-fintech-highlight hover:bg-white/5`}
                          >
                            +GP
                          </button>
                          {u.banned ? (
                            <button
                              type="button"
                              onClick={() => submitBan(u, false)}
                              disabled={banSubmitting === u.id}
                              className={`${ACTION_BTN} rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white disabled:opacity-50`}
                            >
                              {banSubmitting === u.id ? "…" : "Unban"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => submitBan(u, true)}
                              disabled={banSubmitting === u.id}
                              className={`${ACTION_BTN} rounded-xl bg-red-600/90 hover:bg-red-600 text-white disabled:opacity-50`}
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
          <p className="mt-4 text-xs text-fintech-muted">
            Showing {filtered.length} of {users.length} user{users.length !== 1 ? "s" : ""}.
          </p>
        )}
      </div>

      {credit && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full rounded-xl border border-white/10 bg-fintech-bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">
              Credit {credit.kind === "usd" ? "USD" : "GPay"} — {credit.email}
            </h2>
            <p className="mt-1 text-sm text-fintech-muted">
              Amount in dollars (e.g. 5.00 = {credit.kind === "usd" ? "500 cents USD" : "500 minor GP"}).
            </p>
            <form onSubmit={submitCredit} className="mt-4 space-y-3">
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                placeholder="Amount (USD)"
              />
              <input
                type="text"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                placeholder="Reason (optional)"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setCredit(null)}
                  className="px-4 py-2 rounded-lg border border-white/20 text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creditBusy}
                  className="px-4 py-2 rounded-xl bg-fintech-accent text-white font-medium hover:bg-fintech-accent/90 disabled:opacity-50"
                >
                  {creditBusy ? "…" : "Apply"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
