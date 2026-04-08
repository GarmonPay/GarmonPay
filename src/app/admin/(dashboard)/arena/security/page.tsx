"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiRoot } from "@/lib/api";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = getApiRoot();

export default function AdminArenaSecurityPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [data, setData] = useState<{
    velocity?: Array<{ userId: string; count: number; lastAt: string; ipCount: number }>;
    sameIpAccounts?: Array<{ ip: string; userCount: number; userIds: string[] }>;
    recentCount?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch(`${API_BASE}/admin/arena/security`, { headers: adminApiHeaders(session), credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-fintech-muted">
        Redirecting to admin login…
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-white mb-2">Arena — Security & Anti-cheat</h1>
      <p className="text-fintech-muted text-sm mb-6">
        Rate limits: train 30/min, fight create 20/min, spin 10/min. Activity is logged (IP, optional fingerprint). <Link href="/admin/arena" className="text-fintech-accent hover:underline">Back to Arena admin</Link>
      </p>

      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">High-velocity users (last 7 days)</h2>
            <div className="rounded-lg border border-white/10 bg-black/30 overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-fintech-muted border-b border-white/10"><th className="p-2">User ID</th><th className="p-2">Actions</th><th className="p-2">IPs</th><th className="p-2">Last</th></tr></thead>
                <tbody>
                  {(data?.velocity ?? []).map((v) => (
                    <tr key={v.userId} className="border-b border-white/5"><td className="p-2 font-mono text-xs">{v.userId.slice(0, 8)}…</td><td className="p-2">{v.count}</td><td className="p-2">{v.ipCount}</td><td className="p-2 text-fintech-muted">{v.lastAt ? new Date(v.lastAt).toLocaleString() : ""}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white mb-2">Same-IP accounts</h2>
            <div className="rounded-lg border border-white/10 bg-black/30 overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-fintech-muted border-b border-white/10"><th className="p-2">IP</th><th className="p-2">Users</th><th className="p-2">User IDs</th></tr></thead>
                <tbody>
                  {(data?.sameIpAccounts ?? []).map((s) => (
                    <tr key={s.ip} className="border-b border-white/5"><td className="p-2">{s.ip}</td><td className="p-2">{s.userCount}</td><td className="p-2 font-mono text-xs">{s.userIds.map((id) => id.slice(0, 8)).join(", ")}…</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <p className="mt-6 text-fintech-muted text-sm">Activity log: arena_activity_log. Server resolves all tap actions; no client-side outcome trust.</p>
    </div>
  );
}
