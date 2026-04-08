"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdminSessionAsync, adminApiHeaders, type AdminSession } from "@/lib/admin-supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function fmt(num: number) {
  return `$${Number(num).toFixed(2)}`;
}

export default function AdminArenaPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [data, setData] = useState<{
    earnings?: Record<string, number>;
    stats?: { fightCount: number; spectatorBetCount: number; activeSeasonPassCount: number };
    aiGenerations?: { questionnaire: number; auto: number; total: number; regenerationCount: number; regenerationRevenueCoins: number };
    tournaments?: Array<{ id: string; name: string; status: string; prize_pool: number; tournament_type: string }>;
    jackpots?: Array<{ id: string; week_start: string; total_amount: number; paid_out: boolean }>;
    recentEarnings?: Array<{ source_type: string; amount: number; source_id?: string; created_at: string }>;
    payoutQueue?: Array<{ type: string; count?: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminSessionAsync().then(setSession);
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch(`${API_BASE}/admin/arena/overview`, { headers: adminApiHeaders(session), credentials: "include" })
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

  const e = data?.earnings ?? {};
  const stats = data?.stats ?? { fightCount: 0, spectatorBetCount: 0, activeSeasonPassCount: 0 };

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-white mb-2">GarmonPay Arena — Admin</h1>
      <p className="text-fintech-muted text-sm mb-6">Earnings, fight/spectator/tournament/store/coin/jackpot/season pass monitors, payout queue. <Link href="/admin/security" className="text-fintech-accent hover:underline">Security</Link> · <Link href="/admin/arena/security" className="text-fintech-accent hover:underline">Arena security</Link></p>

      {loading ? (
        <p className="text-fintech-muted">Loading…</p>
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
              <p className="text-fintech-muted text-sm">Store</p>
              <p className="text-xl font-bold text-white">{fmt(e.storeRevenue ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-fintech-bg-card p-4">
              <p className="text-fintech-muted text-sm">Coin sales</p>
              <p className="text-xl font-bold text-white">{fmt(e.coinSales ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-fintech-bg-card p-4">
              <p className="text-fintech-muted text-sm">Season pass</p>
              <p className="text-xl font-bold text-white">{fmt(e.seasonPass ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-fintech-bg-card p-4">
              <p className="text-fintech-muted text-sm">Withdrawal fees</p>
              <p className="text-xl font-bold text-white">{fmt(e.withdrawalFees ?? 0)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-fintech-bg-card p-4">
              <p className="text-fintech-muted text-sm">Total arena earnings</p>
              <p className="text-xl font-bold text-emerald-400">{fmt(e.total ?? 0)}</p>
            </div>
          </div>

          {(data?.aiGenerations != null) && (
            <div className="rounded-lg border border-fintech-highlight/30 bg-fintech-bg-card p-4 mb-6">
              <h3 className="text-fintech-highlight font-semibold mb-2">AI fighter generations</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><span className="text-fintech-muted">Questionnaire</span><p className="font-semibold text-white">{data.aiGenerations.questionnaire}</p></div>
                <div><span className="text-fintech-muted">Auto</span><p className="font-semibold text-white">{data.aiGenerations.auto}</p></div>
                <div><span className="text-fintech-muted">Regenerations</span><p className="font-semibold text-white">{data.aiGenerations.regenerationCount}</p></div>
                <div><span className="text-fintech-muted">Regen revenue (coins)</span><p className="font-semibold text-white">{data.aiGenerations.regenerationRevenueCoins}</p></div>
              </div>
            </div>
          )}
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

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Recent earnings</h2>
              <div className="rounded-lg border border-white/10 bg-black/30 overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-fintech-muted border-b border-white/10"><th className="p-2">Source</th><th className="p-2">Amount</th><th className="p-2">Time</th></tr></thead>
                  <tbody>
                    {(data?.recentEarnings ?? []).map((row, i) => (
                      <tr key={i} className="border-b border-white/5"><td className="p-2">{row.source_type}</td><td className="p-2 text-emerald-400">{fmt(row.amount)}</td><td className="p-2 text-fintech-muted">{row.created_at ? new Date(row.created_at).toLocaleString() : ""}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white mb-2">Payout queue</h2>
              <ul className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-1">
                {(data?.payoutQueue ?? []).map((q, i) => (
                  <li key={i} className="text-fintech-muted">{q.type}: {q.count ?? 0} pending</li>
                ))}
                {!(data?.payoutQueue?.length) && <li className="text-fintech-muted">None</li>}
              </ul>
              <h2 className="text-lg font-semibold text-white mt-4 mb-2">Jackpot (recent weeks)</h2>
              <ul className="rounded-lg border border-white/10 bg-black/30 p-4 space-y-1 text-sm">
                {(data?.jackpots ?? []).map((j) => (
                  <li key={j.id} className="text-fintech-muted">{j.week_start}: {fmt(j.total_amount)} {j.paid_out ? "(paid)" : ""}</li>
                ))}
              </ul>
            </div>
          </div>

          <h2 className="text-lg font-semibold text-white mt-6 mb-2">Tournaments (recent)</h2>
          <div className="rounded-lg border border-white/10 bg-black/30 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-fintech-muted border-b border-white/10"><th className="p-2">Name</th><th className="p-2">Type</th><th className="p-2">Status</th><th className="p-2">Prize pool</th></tr></thead>
              <tbody>
                {(data?.tournaments ?? []).map((t) => (
                  <tr key={t.id} className="border-b border-white/5"><td className="p-2">{t.name}</td><td className="p-2">{t.tournament_type}</td><td className="p-2">{t.status}</td><td className="p-2">{fmt(t.prize_pool ?? 0)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
