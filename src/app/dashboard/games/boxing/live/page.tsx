"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

interface FightLogEntry {
  t: number;
  type: string;
  attacker: number;
  target: number;
  damage?: number;
  msg: string;
}

interface BoxingMatch {
  id: string;
  player1_id: string;
  player2_id: string | null;
  entry_fee: number;
  status: string;
  winner_id: string | null;
  player1_health?: number;
  player2_health?: number;
  fight_seconds_elapsed?: number;
  fight_log?: FightLogEntry[];
  started_at?: string | null;
}

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

function maskId(id: string) {
  return id ? `${id.slice(0, 6)}…${id.slice(-4)}` : "—";
}

export default function BoxingLivePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = searchParams.get("match")?.trim() ?? "";
  const [session, setSession] = useState<{ userId: string } | null>(null);
  const [match, setMatch] = useState<BoxingMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logIndex, setLogIndex] = useState(0);

  const fetchMatch = useCallback(async () => {
    if (!matchId) return;
    try {
      const res = await fetch(`${API_BASE}/boxing/match/${matchId}`);
      if (!res.ok) throw new Error("Match not found");
      const data = await res.json();
      setMatch(data.match);
      setError(null);
    } catch {
      setError("Match not found");
      setMatch(null);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/games/boxing/live?match=" + matchId);
        return;
      }
      setSession({ userId: s.userId });
    });
  }, [router, matchId]);

  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  useEffect(() => {
    if (!matchId || !session) return;
    const supabase = createBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel("boxing-match-" + matchId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boxing_matches", filter: `id=eq.${matchId}` },
        () => {
          fetchMatch();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, session, fetchMatch]);

  const logLength = match?.fight_log?.length ?? 0;
  useEffect(() => {
    if (logLength === 0) return;
    setLogIndex(logLength - 1);
  }, [logLength]);

  useEffect(() => {
    const log = match?.fight_log ?? [];
    if (logIndex >= log.length) return;
    const t = setTimeout(() => setLogIndex((i) => Math.min(i + 1, log.length)), 400);
    return () => clearTimeout(t);
  }, [match?.fight_log, logIndex]);

  if (!matchId) {
    return (
      <div className="dashboard-main mx-auto max-w-[500px] space-y-6 p-4">
        <Link href="/dashboard/games/boxing" className="text-fintech-accent hover:underline">← Boxing Arena</Link>
        <p className="text-fintech-muted">No match specified. Enter a match from the Arena.</p>
      </div>
    );
  }

  if (loading && !match) {
    return (
      <div className="dashboard-main mx-auto max-w-[500px] flex min-h-[40vh] items-center justify-center p-4">
        <p className="text-fintech-muted">Loading fight…</p>
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="dashboard-main mx-auto max-w-[500px] space-y-6 p-4">
        <Link href="/dashboard/games/boxing" className="text-fintech-accent hover:underline">← Boxing Arena</Link>
        <p className="text-red-400">{error ?? "Match not found."}</p>
      </div>
    );
  }

  const h1 = match.player1_health ?? 100;
  const h2 = match.player2_health ?? 100;
  const log = match.fight_log ?? [];
  const visibleLog = log.slice(0, logIndex + 1);
  const isComplete = match.status === "completed";

  return (
    <div className="dashboard-main mx-auto max-w-[500px] space-y-6 p-4 pb-24">
      <div className="flex items-center justify-between">
        <Link href="/dashboard/games/boxing" className="text-sm font-medium text-fintech-accent hover:underline">
          ← Arena
        </Link>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase text-fintech-muted">
          {match.status}
        </span>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent p-4 shadow-lg">
        <p className="text-center text-sm text-fintech-muted">Prize pool: {formatCents(Number(match.entry_fee) * 2)}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
          <p className="text-xs font-medium uppercase text-fintech-muted">Player 1</p>
          <p className="mt-1 font-mono text-sm text-white">{maskId(match.player1_id)}</p>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${Math.max(0, h1)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-fintech-muted">{h1}%</p>
          {match.winner_id === match.player1_id && (
            <p className="mt-2 text-sm font-bold text-amber-400">WINNER</p>
          )}
        </div>
        <div className="rounded-xl border border-white/20 bg-white/5 p-4 text-center">
          <p className="text-xs font-medium uppercase text-fintech-muted">Player 2</p>
          <p className="mt-1 font-mono text-sm text-white">{match.player2_id ? maskId(match.player2_id) : "Waiting…"}</p>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${Math.max(0, h2)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-fintech-muted">{h2}%</p>
          {match.winner_id === match.player2_id && (
            <p className="mt-2 text-sm font-bold text-amber-400">WINNER</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-fintech-bg-card p-4 shadow-lg">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-fintech-muted">Fight log</h3>
        <ul className="max-h-48 space-y-2 overflow-y-auto">
          {visibleLog.length === 0 && !isComplete && (
            <li className="text-sm text-fintech-muted">Waiting for action…</li>
          )}
          {visibleLog.map((entry, i) => (
            <li
              key={i}
              className={`animate-fade-in rounded-lg border px-3 py-2 text-sm ${
                entry.type === "critical"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  : entry.type === "punch"
                  ? "border-red-500/20 bg-red-500/5 text-red-200"
                  : "border-white/10 bg-white/5 text-fintech-muted"
              }`}
            >
              {entry.msg}
            </li>
          ))}
        </ul>
      </div>

      {isComplete && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-center">
          <p className="font-semibold text-green-300">
            Fight over. Winner: {match.winner_id === match.player1_id ? "Player 1" : "Player 2"}
          </p>
          <Link
            href="/dashboard/games/boxing"
            className="mt-4 inline-block w-full rounded-xl bg-fintech-accent py-3 font-semibold text-white"
          >
            Back to Arena
          </Link>
        </div>
      )}
    </div>
  );
}
