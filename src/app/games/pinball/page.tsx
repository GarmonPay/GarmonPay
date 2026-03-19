"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { PinballGame } from "@/components/games/PinballGame";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

type LeaderboardEntry = {
  rank: number;
  user_id: string;
  username: string | null;
  highest_score: number;
  level: number;
  level_name: string;
};
type Stats = {
  highest_score: number;
  total_score: number;
  games_played: number;
  level: number;
  level_name: string;
  wins: number;
  losses: number;
};

export default function PinballPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postResult, setPostResult] = useState<{
    score: number;
    coins_earned: number;
    rank: number | null;
    personal_best: number;
    level: number;
    level_name: string;
    leaderboard: LeaderboardEntry[];
  } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [jackpotCents, setJackpotCents] = useState<number>(500);

  const token = session?.accessToken ?? "";

  const fetchLeaderboard = useCallback(() => {
    fetch(`${apiBase}/api/pinball/leaderboard`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { leaderboard: [] }))
      .then((d: { leaderboard?: LeaderboardEntry[] }) => setLeaderboard(d.leaderboard ?? []))
      .catch(() => setLeaderboard([]));
  }, []);

  const fetchJackpot = useCallback(() => {
    fetch(`${apiBase}/api/pinball/jackpot/current`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: { current_amount_cents?: number }) => setJackpotCents(d.current_amount_cents ?? 500))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/games/pinball");
        return;
      }
      setSession(s);
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    fetchLeaderboard();
    fetchJackpot();
  }, [fetchLeaderboard, fetchJackpot]);

  useEffect(() => {
    if (!token || !postResult) return;
    setStats({
      highest_score: postResult.personal_best,
      total_score: 0,
      games_played: 0,
      level: postResult.level,
      level_name: postResult.level_name,
      wins: 0,
      losses: 0,
    });
    setLeaderboard(postResult.leaderboard ?? []);
  }, [token, postResult]);

  const handleStartFreePlay = () => {
    if (!token || starting) return;
    setError(null);
    setPostResult(null);
    setStarting(true);
    fetch(`${apiBase}/api/pinball/game/start`, {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mode: "free" }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d: { error?: string }) => Promise.reject(new Error(d.error ?? "Failed to start")));
        return r.json();
      })
      .then((d: { session_id: string }) => {
        setSessionId(d.session_id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to start"))
      .finally(() => setStarting(false));
  };

  const handleGameEnd = useCallback(
    (
      score: number,
      statsArg?: { hits: { bumper: string; t: number }[]; durationMs?: number; ballsUsed?: number }
    ) => {
      if (!sessionId || !token) return;
      const durationSeconds = statsArg?.durationMs != null ? Math.round(statsArg.durationMs / 1000) : 0;
      const ballsUsed = statsArg?.ballsUsed ?? 3;
      fetch(`${apiBase}/api/pinball/game/end`, {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          session_id: sessionId,
          score,
          duration_seconds: durationSeconds,
          balls_used: ballsUsed,
          hits: statsArg?.hits ?? [],
        }),
      })
        .then((r) => (r.ok ? r.json() : r.json().then((d: { error?: string }) => Promise.reject(new Error(d.error ?? "Submit failed")))))
        .then((d: { score?: number; coins_earned?: number; rank?: number | null; leaderboard?: LeaderboardEntry[]; personal_best?: number; level?: number; level_name?: string }) => {
          setPostResult({
            score: d.score ?? 0,
            coins_earned: d.coins_earned ?? 0,
            rank: d.rank ?? null,
            leaderboard: d.leaderboard ?? [],
            personal_best: d.personal_best ?? 0,
            level: d.level ?? 1,
            level_name: d.level_name ?? "ROOKIE",
          });
          fetchLeaderboard();
          fetchJackpot();
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to submit score"))
        .finally(() => setSessionId(null));
    },
    [sessionId, token, fetchLeaderboard, fetchJackpot]
  );

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <p className="text-[#00f0ff]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/games"
              className="text-[#94a3b8] hover:text-[#f0a500] text-sm font-medium"
            >
              ← Game Station
            </Link>
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: "#f0a500", textShadow: "0 0 20px rgba(245,158,11,0.5)" }}
            >
              GARMONPAY PINBALL
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span
              className="text-[#f0a500] font-mono font-semibold animate-pulse"
              style={{ textShadow: "0 0 12px rgba(245,158,11,0.6)" }}
            >
              Jackpot: ${(jackpotCents / 100).toFixed(2)}
            </span>
            {stats != null && (
              <span className="text-[#94a3b8] text-sm">
                Best: {stats.highest_score} · Lv.{stats.level} {stats.level_name}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-500/50 p-4 flex items-center justify-between gap-4">
            <p className="text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-300 hover:text-white text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {postResult && (
          <div className="rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/50 p-4">
            <p className="text-[#22c55e] font-medium">Score: {postResult.score}</p>
            <p className="text-[#f0a500] text-sm mt-1">
              +{postResult.coins_earned} Arena coins · Personal best: {postResult.personal_best}
            </p>
            {postResult.rank != null && (
              <p className="text-[#94a3b8] text-sm">Rank: #{postResult.rank}</p>
            )}
          </div>
        )}

        {!sessionId ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <button
                type="button"
                onClick={handleStartFreePlay}
                disabled={starting}
                className="rounded-xl border-2 border-[#22c55e] bg-[#22c55e]/20 p-6 text-left hover:bg-[#22c55e]/30 disabled:opacity-50 transition-all"
              >
                <h3 className="text-lg font-bold text-[#22c55e]">FREE PLAY</h3>
                <p className="text-sm text-white/80 mt-1">Practice & earn coins · 3 balls</p>
                <p className="text-xs text-white/60 mt-2">No entry fee · Unlimited plays</p>
              </button>
              <div className="rounded-xl border-2 border-[#f0a500]/50 bg-[#f0a500]/10 p-6 text-left opacity-90">
                <h3 className="text-lg font-bold text-[#f0a500]">HEAD TO HEAD</h3>
                <p className="text-sm text-white/80 mt-1">Challenge a player · Coming soon</p>
              </div>
              <div className="rounded-xl border-2 border-[#ef4444]/50 bg-[#ef4444]/10 p-6 text-left opacity-90">
                <h3 className="text-lg font-bold text-[#ef4444]">TOURNAMENT</h3>
                <p className="text-sm text-white/80 mt-1">Enter the tournament · Coming soon</p>
              </div>
            </div>

            <div className="rounded-xl border border-[#3b82f6]/40 bg-[#0d1117] p-6">
              <h3 className="text-[#3b82f6] font-semibold mb-3">Top 10 — Free Play</h3>
              <ul className="space-y-1 text-sm">
                {(leaderboard ?? []).slice(0, 10).map((e) => (
                  <li key={e.user_id} className="flex justify-between items-center">
                    <span className="text-white/90">
                      #{e.rank} {e.username ?? e.user_id.slice(0, 8)} · Lv.{e.level}
                    </span>
                    <span className="text-[#f0a500] font-mono">{e.highest_score}</span>
                  </li>
                ))}
                {(!leaderboard || leaderboard.length === 0) && (
                  <li className="text-white/50">No scores yet. Play to appear here!</li>
                )}
              </ul>
            </div>
          </>
        ) : (
          <PinballGame sessionId={sessionId} mode="free" onGameEnd={handleGameEnd} />
        )}
      </div>
    </div>
  );
}
