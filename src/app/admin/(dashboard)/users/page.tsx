"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";

type UserRow = {
  id: string;
  email: string | null;
  role?: string;
  balance?: number;
  referral_code?: string | null;
  referred_by?: string | null;
  /** Canonical USD cents from wallet_balances (or users.balance fallback). */
  usd_balance_cents?: number;
  raw_balance_cents?: number;
  gpay_available_minor?: number;
  gpay_lifetime_earned_minor?: number;
  banned?: boolean;
  banned_reason?: string | null;
  created_at?: string;
};

function AdminUsersInner() {
  const session = useAdminSession();
  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "1";

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [banSubmitting, setBanSubmitting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [credit, setCredit] = useState<null | { userId: string; email: string; kind: "usd" | "gpay" }>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const q = debug ? "?debug=1" : "";
      const res = await fetch(`/api/admin/users${q}`, {
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.adminId, debug]);

  async function submitCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!credit) return;
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

  return (
    <div className="space-y-6 py-6">
      <div className="rounded-xl border border-white/10 bg-[#0e0118]/80 p-4 tablet:p-6">
        <h1 className="font-[family-name:var(--font-admin-display)] text-xl font-bold text-white mb-2">
          Users
        </h1>
        <p className="text-sm text-white/60 mb-6">
          User management. List and manage registered users.
          {debug && (
            <span className="ml-2 rounded bg-[#f5c842]/20 px-2 py-0.5 text-[#f5c842] text-xs">
              debug=1 (raw_balance_cents)
            </span>
          )}
        </p>

        <div className="mb-4">
          <input
            type="search"
            placeholder="Search by email or user ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white placeholder-white/40"
          />
        </div>

        {loading ? (
          <p className="text-white/60">Loading users…</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : filtered.length === 0 ? (
          <p className="text-white/60">
            {users.length === 0 ? "No users yet." : `No users match "${search.trim()}".`}
          </p>
        ) : (
          <>
            <AdminScrollHint />
            <AdminTableWrap>
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-black/30">
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50">Email</th>
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50 hidden sm:table-cell">
                      ID
                    </th>
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50">Role</th>
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50">USD (wallet)</th>
                    {debug && (
                      <th className="p-3 pr-4 text-xs font-semibold uppercase text-amber-300/90">Raw users.balance_cents</th>
                    )}
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50">GPay</th>
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50">Status</th>
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50 hidden sm:table-cell">
                      Joined
                    </th>
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="max-w-[220px] truncate p-3 pr-4 text-sm font-medium text-white">
                        <span className="block">{u.email ?? "—"}</span>
                        {(u.referral_code || u.referred_by) && (
                          <span className="mt-1 block text-[10px] text-white/45">
                            {u.referral_code && (
                              <span className="mr-2 rounded bg-[#7c3aed]/25 px-1.5 py-0.5 text-[#c4b5fd]">
                                ref {u.referral_code}
                              </span>
                            )}
                            {u.referred_by && <span>referred_by {String(u.referred_by).slice(0, 8)}…</span>}
                          </span>
                        )}
                      </td>
                      <td className="hidden p-3 pr-4 font-mono text-xs text-white/50 sm:table-cell">
                        {u.id.slice(0, 8)}…
                      </td>
                      <td className="p-3 pr-4 text-sm capitalize text-white/60">{u.role ?? "user"}</td>
                      <td className="p-3 pr-4 text-sm text-emerald-400">
                        $
                        {typeof u.usd_balance_cents === "number"
                          ? (u.usd_balance_cents / 100).toFixed(2)
                          : typeof u.balance === "number"
                            ? (u.balance / 100).toFixed(2)
                            : "0.00"}
                      </td>
                      {debug && (
                        <td className="p-3 pr-4 font-mono text-xs text-amber-200">
                          {typeof u.raw_balance_cents === "number" ? u.raw_balance_cents : "—"}
                        </td>
                      )}
                      <td className="p-3 pr-4 text-sm text-[#f5c842]">
                        {(u.gpay_available_minor ?? 0) / 100} GP
                        <span className="block text-[10px] text-white/45">
                          life {(u.gpay_lifetime_earned_minor ?? 0) / 100}
                        </span>
                      </td>
                      <td className="p-3 pr-4">
                        {u.banned ? (
                          <span className="font-medium text-red-400">Banned</span>
                        ) : (
                          <span className="text-emerald-400">Active</span>
                        )}
                      </td>
                      <td className="hidden p-3 pr-4 text-sm text-white/50 sm:table-cell">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-3 pr-4">
                        <div className="flex flex-wrap gap-2 max-[480px]:flex-col">
                          <ActionButton
                            variant="primary"
                            onClick={() => {
                              setCredit({ userId: u.id, email: u.email ?? u.id, kind: "usd" });
                              setCreditAmount("");
                              setCreditReason("");
                            }}
                          >
                            +USD
                          </ActionButton>
                          <ActionButton
                            variant="gold"
                            className="!text-[#0e0118]"
                            onClick={() => {
                              setCredit({ userId: u.id, email: u.email ?? u.id, kind: "gpay" });
                              setCreditAmount("");
                              setCreditReason("");
                            }}
                          >
                            +GP
                          </ActionButton>
                          {u.banned ? (
                            <ActionButton
                              variant="primary"
                              className="!bg-emerald-600 hover:!bg-emerald-600"
                              onClick={() => submitBan(u, false)}
                              disabled={banSubmitting === u.id}
                            >
                              {banSubmitting === u.id ? "…" : "Unban"}
                            </ActionButton>
                          ) : (
                            <ActionButton variant="danger" onClick={() => submitBan(u, true)} disabled={banSubmitting === u.id}>
                              {banSubmitting === u.id ? "…" : "Ban"}
                            </ActionButton>
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
          <p className="mt-4 text-xs text-white/50">
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
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#0e0118] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white">
              Credit {credit.kind === "usd" ? "USD" : "GPay"} — {credit.email}
            </h2>
            <p className="mt-1 text-sm text-white/60">
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
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCredit(null)}
                  className="rounded-lg border border-white/20 px-4 py-2 text-white"
                >
                  Cancel
                </button>
                <ActionButton type="submit" disabled={creditBusy} variant="primary">
                  {creditBusy ? "…" : "Apply"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <AdminPageGate>
      <Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-white/70">Loading…</div>}>
        <AdminUsersInner />
      </Suspense>
    </AdminPageGate>
  );
}
