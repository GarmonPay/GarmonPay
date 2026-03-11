"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { PinballGame } from "@/components/games/PinballGame";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function authHeaders(accessTokenOrUserId: string, isToken: boolean): Record<string, string> {
  return isToken
    ? { Authorization: `Bearer ${accessTokenOrUserId}` }
    : { "X-User-Id": accessTokenOrUserId };
}

type LeaderboardEntry = { rank: number; user_id: string; score: number; email?: string };
type Stats = { bestScore: number; rank: number | null; gamesPlayed: number };

export default function PinballPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [loading, setLoading] = useState(true);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [submitResult, setSubmitResult] = useState<{ rank: number | null; leaderboard: LeaderboardEntry[] } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ all_time: LeaderboardEntry[]; weekly: LeaderboardEntry[] } | null>(null);

  const tokenOrId = session?.accessToken ?? session?.userId ?? "";
  const isToken = !!session?.accessToken;

  const fetchBalance = useCallback(() => {
    if (!tokenOrId) return;
    fetch(`${API_BASE}/wallet/get`, {
      headers: authHeaders(tokenOrId, isToken),
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { balance_cents: 0 }))
      .then((d: { balance_cents?: number }) => setBalanceCents(d.balance_cents ?? 0))
      .catch(() => setBalanceCents(0));
  }, [tokenOrId, isToken]);

  const fetchStats = useCallback(() => {
    if (!tokenOrId) return;
    fetch(`${API_BASE}/games/pinball/stats`, {
      headers: authHeaders(tokenOrId, isToken),
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { bestScore: 0, rank: null, gamesPlayed: 0 }))
      .then(setStats)
      .catch(() => setStats({ bestScore: 0, rank: null, gamesPlayed: 0 }));
  }, [tokenOrId, isToken]);

  const fetchLeaderboard = useCallback(() => {
    fetch(`${API_BASE}/games/pinball/leaderboard`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { all_time: [], weekly: [] }))
      .then(setLeaderboard)
      .catch(() => setLeaderboard({ all_time: [], weekly: [] }));
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
    if (!tokenOrId) return;
    fetchBalance();
    fetchStats();
    fetchLeaderboard();
  }, [tokenOrId, isToken, fetchBalance, fetchStats, fetchLeaderboard]);

  const handlePlay = () => {
    if (!tokenOrId || starting || (balanceCents != null && balanceCents < 10)) return;
    setError(null);
    setSubmitResult(null);
    setLastScore(null);
    setStarting(true);
    fetch(`${API_BASE}/games/pinball/start`, {
      method: "POST",
      headers: { ...authHeaders(tokenOrId, isToken), "Content-Type": "application/json" },
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d: { error?: string }) => Promise.reject(new Error(d.error ?? "Failed to start")));
        return r.json();
      })
      .then((d: { session_id: string; balance_cents: number }) => {
        setSessionId(d.session_id);
        setBalanceCents(d.balance_cents);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to start"))
      .finally(() => setStarting(false));
  };

  const handleGameEnd = useCallback(
    (score: number) => {
      setLastScore(score);
      if (!sessionId || !tokenOrId) return;
      fetch(`${API_BASE}/games/pinball/score`, {
        method: "POST",
        headers: { ...authHeaders(tokenOrId, isToken), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ session_id: sessionId, score }),
      })
        .then((r) => (r.ok ? r.json() : {}))
        .then((d: { ok?: boolean; rank?: number; leaderboard?: LeaderboardEntry[] }) => {
          setSubmitResult({ rank: d.rank ?? null, leaderboard: d.leaderboard ?? [] });
          fetchBalance();
          fetchStats();
          fetchLeaderboard();
        })
        .catch(() => {});
      setSessionId(null);
    },
    [sessionId, tokenOrId, isToken, fetchBalance, fetchStats, fetchLeaderboard]
  );

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <p className="text-[#00f0ff]">Loading…</p>
      </div>
    );
  }

  const costCents = 10;
  const canPlay = balanceCents != null && balanceCents >= costCents && !sessionId;

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/games"
              className="text-[#00f0ff]/80 hover:text-[#00f0ff] text-sm font-medium"
            >
              ← Game Station
            </Link>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#00f0ff", textShadow: "0 0 20px rgba(0,240,255,0.5)" }}>
              GarmonPay Pinball
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[#39ff14] font-mono font-semibold">
              Balance: ${((balanceCents ?? 0) / 100).toFixed(2)}
            </span>
            {stats != null && (
              <span className="text-[#bf00ff]/90 text-sm">
                Best: {stats.bestScore} · Games: {stats.gamesPlayed}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-500/50 p-4 flex items-center justify-between gap-4">
            <p className="text-red-200">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-red-300 hover:text-white text-sm underline">
              Dismiss
            </button>
          </div>
        )}

        {submitResult && lastScore != null && (
          <div className="rounded-xl bg-[#39ff14]/15 border border-[#39ff14]/50 p-4">
            <p className="text-[#39ff14] font-medium">Score submitted: {lastScore}</p>
            {submitResult.rank != null && (
              <p className="text-[#00f0ff] text-sm mt-1">Your rank: #{submitResult.rank}</p>
            )}
          </div>
        )}

        {!sessionId ? (
          <div className="rounded-xl border-2 border-[#00f0ff]/40 bg-[#0a0a12]/80 p-8 text-center" style={{ boxShadow: "0 0 40px rgba(0,240,255,0.1)" }}>
            <p className="text-[#00f0ff]/90 mb-4">Pay {costCents}¢ per game. Hit bumpers for points, land in JACKPOT for 5000!</p>
            <button
              type="button"
              onClick={handlePlay}
              disabled={!canPlay || starting}
              className="px-8 py-4 rounded-xl font-bold text-lg bg-[#00f0ff]/20 border-2 border-[#00f0ff] text-[#00f0ff] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#00f0ff]/30 transition-all"
              style={{ boxShadow: "0 0 25px rgba(0,240,255,0.3)" }}
            >
              {starting ? "Starting…" : canPlay ? `Play for ${costCents}¢` : "Insufficient balance"}
            </button>
          </div>
        ) : (
          <PinballGame sessionId={sessionId} onGameEnd={handleGameEnd} />
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-[#00f0ff]/30 bg-black/20 p-6">
            <h3 className="text-[#00f0ff] font-semibold mb-3">Top 10 All-Time</h3>
            <ul className="space-y-1 text-sm">
              {(leaderboard?.all_time ?? []).slice(0, 10).map((e) => (
                <li key={e.user_id} className="flex justify-between">
                  <span className="text-white/90">#{e.rank} {(e.email ?? "").replace(/(.{2}).*(@.*)/, "$1…$2")}</span>
                  <span className="text-[#39ff14] font-mono">{e.score}</span>
                </li>
              ))}
              {(!leaderboard?.all_time?.length) && <li className="text-white/50">No scores yet.</li>}
            </ul>
          </div>
          <div className="rounded-xl border border-[#bf00ff]/30 bg-black/20 p-6">
            <h3 className="text-[#bf00ff] font-semibold mb-3">Weekly Champions</h3>
            <ul className="space-y-1 text-sm">
              {(leaderboard?.weekly ?? []).slice(0, 10).map((e) => (
                <li key={e.user_id} className="flex justify-between">
                  <span className="text-white/90">#{e.rank} {(e.email ?? "").replace(/(.{2}).*(@.*)/, "$1…$2")}</span>
                  <span className="text-[#39ff14] font-mono">{e.score}</span>
                </li>
              ))}
              {(!leaderboard?.weekly?.length) && <li className="text-white/50">No scores this week.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
