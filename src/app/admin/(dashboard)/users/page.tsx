"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";
import { ActionButton } from "@/components/admin/ActionButton";
import { createBrowserClient } from "@/lib/supabase";
import { UsernameAvailabilityField } from "@/components/auth/UsernameAvailabilityField";
import { useUsernameAvailability } from "@/hooks/useUsernameAvailability";
import { validateUsernameFormat } from "@/lib/username-validation";

type AdminUsernameHistRow = {
  old_username: string;
  new_username: string;
  changed_at: string;
  reason?: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  username?: string | null;
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

  const supabase = useMemo(() => createBrowserClient(), []);
  const [changeUser, setChangeUser] = useState<UserRow | null>(null);
  const [changeUsernameValue, setChangeUsernameValue] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeErr, setChangeErr] = useState("");

  const [historyUser, setHistoryUser] = useState<UserRow | null>(null);
  const [historyRows, setHistoryRows] = useState<AdminUsernameHistRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { state: adminNewUsernameState } = useUsernameAvailability(supabase, changeUsernameValue, {
    excludeUserId: changeUser?.id ?? null,
  });

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

  async function openUsernameHistory(u: UserRow) {
    setHistoryUser(u);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/username-history`, {
        credentials: "include",
        headers: adminApiHeaders(session),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHistoryRows([]);
        return;
      }
      setHistoryRows((data as { rows?: AdminUsernameHistRow[] }).rows ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function submitAdminUsernameChange(e: React.FormEvent) {
    e.preventDefault();
    if (!changeUser) return;
    setChangeErr("");
    const trimmed = changeUsernameValue.trim();
    const v = validateUsernameFormat(trimmed);
    if (!v.ok) {
      setChangeErr(v.reason ?? "Invalid username");
      return;
    }
    if (adminNewUsernameState !== "available") {
      setChangeErr("Username is not available.");
      return;
    }
    const reason = changeReason.trim();
    if (!reason) {
      setChangeErr("Reason is required.");
      return;
    }
    setChangeBusy(true);
    try {
      const res = await fetch("/api/admin/users/change-username", {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: changeUser.id,
          newUsername: trimmed,
          reason,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChangeErr((data as { message?: string }).message ?? "Failed");
        return;
      }
      setChangeUser(null);
      setChangeUsernameValue("");
      setChangeReason("");
      load();
    } finally {
      setChangeBusy(false);
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
    ? users.filter((u) => {
        const q = search.trim().toLowerCase();
        return (
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q) ||
          (u.id ?? "").toLowerCase().includes(q)
        );
      })
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
            placeholder="Search by email, username, or user ID…"
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
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-black/30">
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50">Email</th>
                    <th className="p-3 pr-4 text-xs font-semibold uppercase text-white/50">Username</th>
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
                      <td className="max-w-[140px] truncate p-3 pr-4 text-sm text-[#f5c842]">
                        {u.username?.trim() || "—"}
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
                          <ActionButton
                            variant="primary"
                            className="!bg-[#7c3aed] hover:!bg-[#6d28d9]"
                            disabled={!supabase}
                            onClick={() => {
                              setChangeUser(u);
                              setChangeUsernameValue("");
                              setChangeReason("");
                              setChangeErr("");
                            }}
                          >
                            Username
                          </ActionButton>
                          <ActionButton
                            variant="primary"
                            className="!bg-[#0e0118] !ring-1 !ring-[#7c3aed]/50"
                            onClick={() => void openUsernameHistory(u)}
                          >
                            @ history
                          </ActionButton>
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

      {changeUser && supabase && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={submitAdminUsernameChange}
            className="w-full max-w-md rounded-xl border border-[#7c3aed]/30 bg-[#0e0118] p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-[#f5c842]">Change username</h2>
            <p className="mt-1 text-sm text-white/60">
              Target: {changeUser.email ?? changeUser.id} · current{" "}
              <span className="text-[#f5c842]">{changeUser.username?.trim() || "—"}</span>
            </p>
            <div className="mt-4 space-y-3">
              <UsernameAvailabilityField
                supabase={supabase}
                value={changeUsernameValue}
                onChange={setChangeUsernameValue}
                excludeUserId={changeUser.id}
                disabled={changeBusy}
                id="admin_new_username"
                label="New username"
                labelClassName="block text-xs font-medium text-white/50 mb-1"
                inputClassName="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#7c3aed]/60 focus:outline-none focus:ring-1 focus:ring-[#7c3aed]/30"
              />
              <div>
                <label htmlFor="admin_username_reason" className="block text-xs font-medium text-white/50 mb-1">
                  Reason (required)
                </label>
                <textarea
                  id="admin_username_reason"
                  required
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#7c3aed]/60 focus:outline-none"
                  placeholder="e.g. User request, compliance, typo fix…"
                />
              </div>
              {changeErr ? <p className="text-sm text-red-400">{changeErr}</p> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setChangeUser(null);
                  setChangeErr("");
                }}
                className="rounded-lg border border-white/20 px-4 py-2 text-white"
              >
                Cancel
              </button>
              <ActionButton
                type="submit"
                disabled={
                  changeBusy ||
                  adminNewUsernameState !== "available" ||
                  !validateUsernameFormat(changeUsernameValue.trim()).ok
                }
                variant="gold"
                className="!text-[#0e0118]"
              >
                {changeBusy ? "…" : "Submit"}
              </ActionButton>
            </div>
          </form>
        </div>
      )}

      {historyUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-[#7c3aed]/30 bg-[#0e0118] p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#f5c842]">Username history</h2>
            <p className="mt-1 text-sm text-white/60">
              {historyUser.email ?? historyUser.id} · @{historyUser.username?.trim() || "—"}
            </p>
            <div className="mt-4 max-h-72 overflow-y-auto text-sm">
              {historyLoading ? (
                <p className="text-white/50">Loading…</p>
              ) : historyRows.length === 0 ? (
                <p className="text-white/50">No changes recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {historyRows.map((r) => (
                    <li key={`${r.changed_at}-${r.old_username}`} className="border-b border-white/10 pb-2 text-white/85">
                      <span className="text-[#f5c842]">{r.old_username}</span>
                      <span className="mx-1 text-white/40">→</span>
                      <span className="text-emerald-300">{r.new_username}</span>
                      <div className="mt-0.5 text-xs text-white/45">
                        {new Date(r.changed_at).toLocaleString()}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryUser(null)}
                className="rounded-lg border border-white/20 px-4 py-2 text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
