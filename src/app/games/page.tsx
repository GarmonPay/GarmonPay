"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function authHeaders(accessTokenOrUserId: string, isToken: boolean): Record<string, string> {
  return isToken
    ? { Authorization: `Bearer ${accessTokenOrUserId}` }
    : { "X-User-Id": accessTokenOrUserId };
}

type LeaderboardEntry = { rank: number; user_id: string; score: number; email?: string };

const GAMES: { slug: string; name: string; route: string; costCents: number; emoji: string; color: string }[] = [
  { slug: "pinball", name: "GarmonPay Pinball", route: "/games/pinball", costCents: 10, emoji: "🎮", color: "#00f0ff" },
  { slug: "runner", name: "Crypto Runner", route: "/games/runner", costCents: 5, emoji: "🏃", color: "#39ff14" },
  { slug: "snake", name: "Neon Snake", route: "/games/snake", costCents: 5, emoji: "🐍", color: "#bf00ff" },
  { slug: "shooter", name: "Token Shooter", route: "/games/shooter", costCents: 5, emoji: "🎯", color: "#ffaa00" },
  { slug: "dodge", name: "Dodge Arena", route: "/games/dodge", costCents: 5, emoji: "💥", color: "#ff00ff" },
  { slug: "tap", name: "Speed Tap Challenge", route: "/games/tap", costCents: 5, emoji: "👆", color: "#00ff88" },
  { slug: "spin", name: "Spin Wheel Jackpot", route: "/games/spin", costCents: 0, emoji: "🎡", color: "#ffd700" },
  { slug: "memory", name: "Memory Match", route: "/games/memory", costCents: 5, emoji: "🃏", color: "#00d4ff" },
  { slug: "reaction", name: "Reaction Test", route: "/games/reaction", costCents: 5, emoji: "⚡", color: "#ff6600" },
];

export default function GameStationPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [loading, setLoading] = useState(true);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ global: LeaderboardEntry[]; weekly: LeaderboardEntry[] } | null>(null);

  const tokenOrId = session?.accessToken ?? session?.userId ?? "";
  const isToken = !!session?.accessToken;

  const fetchStats = useCallback(() => {
    if (!tokenOrId) return;
    fetch(`${apiBase}/games/station/stats`, {
      headers: authHeaders(tokenOrId, isToken),
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { balance_cents: 0, rank: null }))
      .then((d: { balance_cents?: number; rank?: number | null }) => {
        setBalanceCents(d.balance_cents ?? 0);
        setRank(d.rank ?? null);
      })
      .catch(() => {
        setBalanceCents(0);
        setRank(null);
      });
  }, [tokenOrId, isToken]);

  const fetchLeaderboard = useCallback(() => {
    fetch(`${apiBase}/games/station/leaderboard`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { global: [], weekly: [] }))
      .then(setLeaderboard)
      .catch(() => setLeaderboard({ global: [], weekly: [] }));
  }, []);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/games");
        return;
      }
      setSession(s);
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    if (!tokenOrId) return;
    fetchStats();
    fetchLeaderboard();
  }, [tokenOrId, isToken, fetchStats, fetchLeaderboard]);

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <div className="text-[#00f0ff] animate-pulse">Loading Game Station…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white overflow-x-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#00f0ff]/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-[#bf00ff]/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-[#39ff14]/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "0.5s" }} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,240,255,0.08),transparent)]" />
      </div>

      <div className="relative max-w-6xl mx-auto p-4 md:p-6 space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-[#00f0ff]/80 hover:text-[#00f0ff] text-sm font-medium transition-colors"
            >
              ← Dashboard
            </Link>
            <h1
              className="text-3xl md:text-4xl font-black tracking-tighter"
              style={{ color: "#00f0ff", textShadow: "0 0 30px rgba(0,240,255,0.6), 0 0 60px rgba(0,240,255,0.3)" }}
            >
              GARMONPAY GAME STATION
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 border border-[#39ff14]/40" style={{ boxShadow: "0 0 20px rgba(57,255,20,0.2)" }}>
              <span className="text-[#39ff14] font-mono font-bold">${((balanceCents ?? 0) / 100).toFixed(2)}</span>
              <span className="text-white/70 text-sm">credits</span>
            </div>
            {rank != null && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 border border-[#bf00ff]/40" style={{ boxShadow: "0 0 20px rgba(191,0,255,0.2)" }}>
                <span className="text-[#bf00ff] font-bold">Rank #{rank}</span>
              </div>
            )}
          </div>
        </header>

        {/* Global leaderboard strip */}
        <section className="rounded-2xl border border-[#00f0ff]/30 bg-black/30 p-6 backdrop-blur-sm" style={{ boxShadow: "0 0 40px rgba(0,240,255,0.1)" }}>
          <h2 className="text-[#00f0ff] font-bold text-lg mb-4 flex items-center gap-2">
            <span style={{ filter: "drop-shadow(0 0 8px rgba(0,240,255,0.5))" }}>🏆</span>
            Global Leaderboard — Top 10
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(leaderboard?.global ?? []).slice(0, 10).map((e) => (
              <div key={e.user_id} className="flex justify-between items-center py-2 px-3 rounded-lg bg-white/5 border border-white/10">
                <span className="text-[#00f0ff] font-mono text-sm">#{e.rank}</span>
                <span className="text-white/90 text-sm truncate max-w-[100px]">{(e.email ?? "—").replace(/(.{2}).*(@.*)/, "$1…$2")}</span>
                <span className="text-[#39ff14] font-mono text-sm">{e.score}</span>
              </div>
            ))}
            {(!leaderboard?.global?.length) && (
              <p className="col-span-full text-white/50 text-sm">Play games to climb the leaderboard.</p>
            )}
          </div>
        </section>

        {/* Arcade grid */}
        <section>
          <h2 className="text-[#bf00ff] font-bold text-xl mb-6" style={{ textShadow: "0 0 15px rgba(191,0,255,0.5)" }}>
            Arcade cabinets
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {GAMES.map((game) => (
              <Link
                key={game.slug}
                href={game.route}
                className="group block no-underline text-inherit"
              >
                <div
                  className="relative rounded-2xl border-2 bg-black/50 p-6 transition-all duration-300 overflow-hidden"
                  style={{
                    borderColor: `${game.color}40`,
                    boxShadow: `0 0 25px ${game.color}20, inset 0 0 30px ${game.color}08`,
                  }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: `radial-gradient(circle at 50% 50%, ${game.color}15, transparent 70%)` }} />
                  <div className="relative flex flex-col items-center text-center">
                    <span className="text-4xl mb-2" style={{ filter: `drop-shadow(0 0 12px ${game.color}80)` }}>
                      {game.emoji}
                    </span>
                    <h3 className="font-bold text-white text-sm md:text-base mb-1" style={{ color: game.color }}>
                      {game.name}
                    </h3>
                    <p className="text-white/60 text-xs">
                      {game.costCents === 0 ? "Free" : `${game.costCents}¢`}
                    </p>
                    <span className="mt-3 inline-block py-1.5 px-3 rounded-lg text-xs font-semibold transition-all group-hover:scale-105" style={{ backgroundColor: `${game.color}25`, color: game.color }}>
                      PLAY →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Weekly champs */}
        <section className="rounded-2xl border border-[#bf00ff]/30 bg-black/30 p-6 backdrop-blur-sm" style={{ boxShadow: "0 0 40px rgba(191,0,255,0.1)" }}>
          <h2 className="text-[#bf00ff] font-bold text-lg mb-4">Weekly Champions</h2>
          <ul className="space-y-2">
            {(leaderboard?.weekly ?? []).slice(0, 5).map((e) => (
              <li key={e.user_id} className="flex justify-between items-center py-2 px-3 rounded-lg bg-white/5">
                <span className="text-white/90">#{e.rank} {(e.email ?? "—").replace(/(.{2}).*(@.*)/, "$1…$2")}</span>
                <span className="text-[#39ff14] font-mono">{e.score}</span>
              </li>
            ))}
            {(!leaderboard?.weekly?.length) && <li className="text-white/50 text-sm">No weekly scores yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
