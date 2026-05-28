"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getApiRoot } from "@/lib/api";
import { adminApiHeaders } from "@/lib/admin-supabase";
import { AdminPageGate, useAdminSession } from "@/components/admin/AdminPageGate";

const API_BASE = getApiRoot();

type ArenaTab = "overview" | "security";

function fmt(num: number) {
  return `$${Number(num).toFixed(2)}`;
}

function AdminArenaPageInner() {
  const session = useAdminSession();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<ArenaTab>(
    searchParams.get("tab") === "security" ? "security" : "overview"
  );
  const [data, setData] = useState<{
    earnings?: Record<string, number>;
    stats?: { fightCount: number; spectatorBetCount: number; activeSeasonPassCount: number };
    aiGenerations?: {
      questionnaire: number;
      auto: number;
      total: number;
      regenerationCount: number;
      regenerationRevenueCoins: number;
    };
    tournaments?: Array<{
      id: string;
      name: string;
      status: string;
      prize_pool: number;
      tournament_type: string;
    }>;
    jackpots?: Array<{ id: string; week_start: string; total_amount: number; paid_out: boolean }>;
    recentEarnings?: Array<{ source_type: string; amount: number; source_id?: string; created_at: string }>;
    payoutQueue?: Array<{ type: string; count?: number }>;
  } | null>(null);
  const [securityData, setSecurityData] = useState<{
    velocity?: Array<{ userId: string; count: number; lastAt: string; ipCount: number }>;
    sameIpAccounts?: Array<{ ip: string; userCount: number; userIds: string[] }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/admin/arena/overview`, {
        headers: adminApiHeaders(session),
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : {})),
      fetch(`${API_BASE}/admin/arena/security`, {
        headers: adminApiHeaders(session),
        credentials: "include",
      }).then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([overview, security]) => {
        setData(overview);
        setSecurityData(security);
      })
      .catch(() => {
        setData(null);
        setSecurityData(null);
      })
      .finally(() => setLoading(false));
  }, [session]);

  const e = data?.earnings ?? {};
  const stats = data?.stats ?? { fightCount: 0, spectatorBetCount: 0, activeSeasonPassCount: 0 };

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-white mb-2">Arena</h1>
      <p className="text-fintech-muted text-sm mb-4">
        Fight economy, tournaments, jackpots.{" "}
        <Link href="/admin/security" className="text-fintech-accent hover:underline">
          Platform security
        </Link>
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            { id: "overview" as const, label: "Overview" },
            { id: "security" as const, label: "Arena Security" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-violet-600 text-white" : "bg-white/5 text-fintech-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
      ) : tab === "security" ? (
        <div className="space-y-6">
          <p className="text-fintech-muted text-sm">
            Rate limits: train 30/min, fight create 20/min, spin 10/min.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">High-velocity users (7d)</h2>
              <div className="rounded-lg border border-white/10 bg-black/30 overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-fintech-muted border-b border-white/10">
                      <th className="p-2">User</th>
                      <th className="p-2">Actions</th>
                      <th className="p-2">IPs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(securityData?.velocity ?? []).map((v) => (
                      <tr key={v.userId} className="border-b border-white/5">
                        <td className="p-2 font-mono text-xs">{v.userId.slice(0, 8)}…</td>
                        <td className="p-2">{v.count}</td>
                        <td className="p-2">{v.ipCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Same-IP accounts</h2>
              <div className="rounded-lg border border-white/10 bg-black/30 overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-fintech-muted border-b border-white/10">
                      <th className="p-2">IP</th>
                      <th className="p-2">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(securityData?.sameIpAccounts ?? []).map((s) => (
                      <tr key={s.ip} className="border-b border-white/5">
                        <td className="p-2">{s.ip}</td>
                        <td className="p-2">{s.userCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            <div className="rounded-lg border border-white/10 bg-fintech-bg-card p-4">
              <p className="text-fintech-muted text-sm">Fight cuts (10%)</p>
              <p className="text-xl font-bold text-white">{fmt(e.fightCuts ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-fintech-bg-card p-4">
              <p className="text-fintech-muted text-sm">Spectator (10%)</p>
              <p className="text-xl font-bold text-white">{fmt(e.spectatorCuts ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-fintech-bg-card p-4">
              <p className="text-fintech-muted text-sm">Tournament (15%)</p>
              <p className="text-xl font-bold text-white">{fmt(e.tournamentCuts ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-fintech-bg-card p-4">
              <p className="text-fintech-muted text-sm">Total arena earnings</p>
              <p className="text-xl font-bold text-emerald-400">{fmt(e.total ?? 0)}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <p className="text-fintech-muted text-sm">Fights</p>
              <p className="text-lg font-semibold text-white">{stats.fightCount}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <p className="text-fintech-muted text-sm">Spectator bets</p>
              <p className="text-lg font-semibold text-white">{stats.spectatorBetCount}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <p className="text-fintech-muted text-sm">Active season pass</p>
              <p className="text-lg font-semibold text-white">{stats.activeSeasonPassCount}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminArenaPage() {
  return (
    <AdminPageGate>
      <Suspense fallback={<p className="p-6 text-fintech-muted">Loading…</p>}>
        <AdminArenaPageInner />
      </Suspense>
    </AdminPageGate>
  );
}
