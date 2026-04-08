"use client";

import { useCallback, useEffect, useState } from "react";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";
import { AdminScrollHint, AdminTableWrap } from "@/components/admin/AdminTableScroll";

const ACTION_BTN =
  "inline-flex items-center justify-center min-h-[36px] min-w-[60px] px-2 py-2 rounded-lg text-sm font-medium transition max-[480px]:w-full max-[480px]:min-w-0";

type SecurityEvent = {
  id: string;
  user_id: string | null;
  email: string | null;
  ip_text: string | null;
  event_type: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type MultiIpAccount = {
  registration_ip: string;
  count: number;
  user_ids: string[];
};

type LockedUser = {
  id: string;
  email: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
};

export default function AdminSecurityPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [multiIp, setMultiIp] = useState<MultiIpAccount[]>([]);
  const [failedLogins, setFailedLogins] = useState<SecurityEvent[]>([]);
  const [lockedUsers, setLockedUsers] = useState<LockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [banSubmitting, setBanSubmitting] = useState<string | null>(null);
  const [unlockSubmitting, setUnlockSubmitting] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/security", { credentials: "include", headers: adminApiHeaders(session) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to load");
        return;
      }
      setEvents(data.events ?? []);
      setMultiIp(data.multiIpAccounts ?? []);
      setFailedLogins(data.failedLogins ?? []);
      setLockedUsers(data.lockedUsers ?? []);
    } catch (e) {
      setError("Failed to load security data");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    load();
  }, [session, load]);

  async function banUser(userId: string, banned: boolean) {
    if (!session) return;
    setBanSubmitting(userId);
    try {
      const res = await fetch("/api/admin/ban", {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ userId, banned, reason: banned ? "Fraud / security" : null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || "Failed");
        return;
      }
      load();
    } finally {
      setBanSubmitting(null);
    }
  }

  async function unlockUser(userId: string) {
    if (!session) return;
    setUnlockSubmitting(userId);
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        credentials: "include",
        headers: { ...adminApiHeaders(session), "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || "Failed to unlock");
        return;
      }
      load();
    } finally {
      setUnlockSubmitting(null);
    }
  }

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-fintech-muted">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="py-6 max-w-6xl">
      <h1 className="text-xl font-bold text-white mb-6">Security dashboard</h1>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Multiple accounts from same IP</h2>
        <AdminScrollHint />
        <AdminTableWrap>
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-left text-sm min-w-[400px]">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-2 text-gray-300">IP</th>
                  <th className="px-4 py-2 text-gray-300">Account count</th>
                  <th className="px-4 py-2 text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {multiIp.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-3 text-gray-500">None</td></tr>
                ) : (
                  multiIp.map((row) => (
                    <tr key={row.registration_ip} className="border-t border-white/10">
                      <td className="px-4 py-2 font-mono text-gray-300">{row.registration_ip}</td>
                      <td className="px-4 py-2 text-gray-300">{row.count}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-2 max-[480px]:flex-col">
                          {row.user_ids.map((uid) => (
                            <button
                              key={uid}
                              type="button"
                              onClick={() => banUser(uid, true)}
                              disabled={banSubmitting === uid}
                              className={`${ACTION_BTN} bg-red-600/80 text-white hover:bg-red-600 disabled:opacity-50`}
                            >
                              Ban
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminTableWrap>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Locked accounts</h2>
        <AdminScrollHint />
        <AdminTableWrap>
          <div className="rounded-lg border border-white/10 overflow-hidden">
            <table className="w-full text-left text-sm min-w-[480px]">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-2 text-gray-300">Email</th>
                  <th className="px-4 py-2 text-gray-300 hidden sm:table-cell">Failed attempts</th>
                  <th className="px-4 py-2 text-gray-300 hidden sm:table-cell">Locked until</th>
                  <th className="px-4 py-2 text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lockedUsers.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-3 text-gray-500">None</td></tr>
                ) : (
                  lockedUsers.map((u) => (
                    <tr key={u.id} className="border-t border-white/10">
                      <td className="px-4 py-2 text-gray-300">{u.email ?? u.id}</td>
                      <td className="px-4 py-2 text-gray-300 hidden sm:table-cell">{u.failed_login_attempts}</td>
                      <td className="px-4 py-2 text-gray-300 hidden sm:table-cell">{u.locked_until ? new Date(u.locked_until).toLocaleString() : "—"}</td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => unlockUser(u.id)}
                          disabled={unlockSubmitting === u.id}
                          className={`${ACTION_BTN} bg-fintech-accent/90 text-white hover:bg-fintech-accent disabled:opacity-50`}
                        >
                          Unlock
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminTableWrap>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-3">Failed login attempts / lockouts</h2>
        <AdminScrollHint />
        <div className="rounded-lg border border-white/10 max-h-64 overflow-y-auto">
          <AdminTableWrap>
            <table className="w-full text-left text-sm min-w-[480px]">
              <thead className="bg-white/5 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-gray-300">Time</th>
                  <th className="px-4 py-2 text-gray-300">Email</th>
                  <th className="px-4 py-2 text-gray-300 hidden sm:table-cell">IP</th>
                  <th className="px-4 py-2 text-gray-300">Type</th>
                </tr>
              </thead>
              <tbody>
                {failedLogins.map((e) => (
                  <tr key={e.id} className="border-t border-white/10">
                    <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-gray-300">{e.email ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-gray-400 hidden sm:table-cell">{e.ip_text ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-300">{e.event_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Recent security events</h2>
        <AdminScrollHint />
        <div className="rounded-lg border border-white/10 max-h-96 overflow-y-auto">
          <AdminTableWrap>
            <table className="w-full text-left text-sm min-w-[480px]">
              <thead className="bg-white/5 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-gray-300">Time</th>
                  <th className="px-4 py-2 text-gray-300">Email</th>
                  <th className="px-4 py-2 text-gray-300 hidden sm:table-cell">IP</th>
                  <th className="px-4 py-2 text-gray-300">Event</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-white/10">
                    <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 text-gray-300">{e.email ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-gray-400 hidden sm:table-cell">{e.ip_text ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-300">{e.event_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableWrap>
        </div>
      </section>
    </div>
  );
}
