"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { useCoins } from "@/hooks/useCoins";
import { formatGpcWithUsd } from "@/lib/gpay-coins-branding";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function authHeaders(accessTokenOrUserId: string, isToken: boolean): Record<string, string> {
  return isToken ? { Authorization: `Bearer ${accessTokenOrUserId}` } : { "X-User-Id": accessTokenOrUserId };
}

type GameStationPlayProps = {
  gameSlug: string;
  gameName: string;
  /** Entry cost in GPay Coins (whole GPC; maps to `users.gpay_coins`, not USD cents). */
  costSc: number;
  children: (props: { onGameEnd: (score: number) => void; started: boolean }) => React.ReactNode;
};

export function GameStationPlay({ gameSlug, gameName, costSc, children }: GameStationPlayProps) {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [loading, setLoading] = useState(true);
  const { sweepsCoins, refresh } = useCoins();
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [submitResult, setSubmitResult] = useState<{ rank: number | null } | null>(null);

  const tokenOrId = session?.accessToken ?? session?.userId ?? "";
  const isToken = !!session?.accessToken;

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace(`/login?next=/games/${gameSlug}`);
        return;
      }
      setSession(s);
      setLoading(false);
    });
  }, [router, gameSlug]);

  const handleStart = () => {
    if (!tokenOrId || starting || (costSc > 0 && sweepsCoins < costSc)) return;
    setError(null);
    setSubmitResult(null);
    setLastScore(null);
    setStarting(true);
    fetch(`${API_BASE}/games/station/start`, {
      method: "POST",
      headers: { ...authHeaders(tokenOrId, isToken), "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ game_slug: gameSlug }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d: { error?: string }) => Promise.reject(new Error(d.error ?? "Failed to start")));
        return r.json();
      })
      .then(() => {
        void refresh();
        setStarted(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to start"))
      .finally(() => setStarting(false));
  };

  const onGameEnd = useCallback(
    (score: number) => {
      setLastScore(score);
      if (!tokenOrId) return;
      fetch(`${API_BASE}/games/station/score`, {
        method: "POST",
        headers: { ...authHeaders(tokenOrId, isToken), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ game_slug: gameSlug, score }),
      })
        .then((r) => (r.ok ? r.json() : {}))
        .then((d: { rank?: number }) => {
          setSubmitResult({ rank: d.rank ?? null });
          void refresh();
        })
        .catch(() => {});
      setStarted(false);
    },
    [tokenOrId, isToken, gameSlug, refresh]
  );

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <p className="text-[#00f0ff]">Loading…</p>
      </div>
    );
  }

  const canPlay = costSc === 0 || sweepsCoins >= costSc;
  const balanceLine = formatGpcWithUsd(sweepsCoins);

  return (
    <div className="min-h-screen bg-[#0a0a12] text-white">
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/games" className="text-[#00f0ff]/80 hover:text-[#00f0ff] text-sm font-medium">← Game Station</Link>
            <h1 className="text-2xl font-bold" style={{ color: "#00f0ff", textShadow: "0 0 20px rgba(0,240,255,0.5)" }}>{gameName}</h1>
          </div>
          <span className="text-[#39ff14] font-mono font-semibold">Balance: {balanceLine}</span>
        </div>
        {error && (
          <div className="rounded-xl bg-red-500/20 border border-red-500/50 p-4 flex justify-between items-center">
            <p className="text-red-200">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-red-300 hover:text-white text-sm underline">Dismiss</button>
          </div>
        )}
        {submitResult != null && lastScore != null && (
          <div className="rounded-xl bg-[#39ff14]/15 border border-[#39ff14]/50 p-4">
            <p className="text-[#39ff14] font-medium">Score: {lastScore}</p>
            {submitResult.rank != null && <p className="text-[#00f0ff] text-sm">Rank #{submitResult.rank}</p>}
          </div>
        )}
        {!started ? (
          <div className="rounded-xl border-2 border-[#00f0ff]/40 bg-black/40 p-8 text-center">
            <p className="text-[#00f0ff]/90 mb-4">
              {costSc === 0 ? "Free to play." : `Cost: ${formatGpcWithUsd(costSc)} per game.`}
            </p>
            <button
              type="button"
              onClick={handleStart}
              disabled={!canPlay || starting}
              className="px-8 py-4 rounded-xl font-bold text-lg bg-[#00f0ff]/20 border-2 border-[#00f0ff] text-[#00f0ff] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#00f0ff]/30 transition-all"
            >
              {starting ? "Starting…" : canPlay ? (costSc === 0 ? "Play" : `Play for ${costSc} GPC`) : "Insufficient GPay Coins"}
            </button>
          </div>
        ) : (
          children({ onGameEnd, started: true })
        )}
      </div>
    </div>
  );
}
