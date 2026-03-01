"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAdminSessionAsync, type AdminSession } from "@/lib/admin-supabase";
import { adminBackendFetch } from "@/lib/admin-backend-api";

type AnalyticsRow = {
  id: string;
  userId: string;
  userEmail: string;
  eventType: string;
  source: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const supportedEvents = ["all", "login", "ad_view", "reward_earned", "withdrawal_requested"] as const;

export default function AdminAnalyticsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [events, setEvents] = useState<AnalyticsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<(typeof supportedEvents)[number]>("all");

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        limit: "500",
        offset: "0",
      });
      if (eventFilter !== "all") {
        query.set("eventType", eventFilter);
      }
      const data = await adminBackendFetch<{ events: AnalyticsRow[] }>(`/admin/analytics?${query.toString()}`);
      setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [eventFilter]);

  useEffect(() => {
    if (!session) return;
    void load();
  }, [session, load]);

  const totalsByType = useMemo(() => {
    const totals = new Map<string, number>();
    for (const event of events) {
      totals.set(event.eventType, (totals.get(event.eventType) ?? 0) + 1);
    }
    return totals;
  }, [events]);

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
          <h1 className="text-2xl font-bold text-white mb-1">Analytics</h1>
          <p className="text-[#9ca3af]">Operational event telemetry from mobile and backend APIs.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value as (typeof supportedEvents)[number])}
            className="px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white"
          >
            {supportedEvents.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All events" : item}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-4 mb-6">
        <p className="text-xs uppercase tracking-wider text-[#9ca3af] mb-3">Event counts</p>
        <div className="flex flex-wrap gap-2">
          {Array.from(totalsByType.entries()).map(([key, value]) => (
            <span key={key} className="px-2 py-1 rounded-full text-xs bg-white/10 text-white">
              {key}: {value}
            </span>
          ))}
          {totalsByType.size === 0 && <span className="text-[#9ca3af] text-sm">No events.</span>}
        </div>
      </div>

      <div className="rounded-xl bg-[#111827] border border-white/10 p-6">
        {loading ? (
          <p className="text-[#9ca3af]">Loading analytics…</p>
        ) : error ? (
          <p className="text-red-400">{error}</p>
        ) : events.length === 0 ? (
          <p className="text-[#9ca3af]">No analytics events found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Date</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Event</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Source</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">User</th>
                  <th className="pb-2 pr-4 text-[#9ca3af] font-medium">Payload</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-white/5">
                    <td className="py-3 pr-4 text-[#9ca3af]">{new Date(event.createdAt).toLocaleString()}</td>
                    <td className="py-3 pr-4 text-white">{event.eventType}</td>
                    <td className="py-3 pr-4 text-[#9ca3af]">{event.source}</td>
                    <td className="py-3 pr-4 text-[#9ca3af] max-w-[220px] truncate">
                      {event.userEmail || event.userId || "anonymous"}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[#9ca3af] font-mono max-w-[440px] truncate">
                      {JSON.stringify(event.payload)}
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
