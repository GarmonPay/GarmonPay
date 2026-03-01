"use client";

import { useEffect, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

type EventRow = {
  id: string;
  user_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export default function AdminAnalyticsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    fetch(`${API_BASE}/admin/analytics?limit=200`, { headers: { "X-Admin-Id": session.adminId } })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data: { events?: EventRow[] }) => setEvents(data.events ?? []))
      .catch(() => setError("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [session?.adminId]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Analytics</h1>
      <p className="text-[#9ca3af] mb-6">Tracked events: login, ad_view, reward_earned, withdrawal_requested.</p>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}
      {loading ? (
        <div className="text-[#9ca3af]">Loading…</div>
      ) : events.length === 0 ? (
        <div className="text-[#9ca3af]">No events yet.</div>
      ) : (
        <div className="rounded-xl bg-[#111827] border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">User ID</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Event</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Payload</th>
                  <th className="p-3 text-sm font-medium text-[#9ca3af]">Date</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-white/5">
                    <td className="p-3 text-white font-mono text-sm">{e.user_id ?? "—"}</td>
                    <td className="p-3 text-white">{e.event_type}</td>
                    <td className="p-3 text-[#9ca3af] text-sm max-w-xs truncate" title={JSON.stringify(e.payload)}>
                      {Object.keys(e.payload || {}).length ? JSON.stringify(e.payload) : "—"}
                    </td>
                    <td className="p-3 text-[#9ca3af] text-sm">{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
