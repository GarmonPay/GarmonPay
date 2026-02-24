"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { createBrowserClient } from "@/lib/supabase";
import {
  getFightArenaFight,
  endFightArenaFight,
  type FightArenaFight,
} from "@/lib/api";

function formatCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export default function FightArenaMatchPage() {
  const router = useRouter();
  const params = useParams();
  const fightId = params.id as string;
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean; userId: string } | null>(null);
  const [fight, setFight] = useState<FightArenaFight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endingFor, setEndingFor] = useState<string | null>(null);

  const loadFight = useCallback(async (tokenOrId: string, isToken: boolean) => {
    try {
      const res = await getFightArenaFight(tokenOrId, isToken, fightId);
      setFight(res.fight);
      setError(null);
    } catch {
      setError("Fight not found");
      setFight(null);
    } finally {
      setLoading(false);
    }
  }, [fightId]);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/fight-arena/match/" + fightId);
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken, userId: s.userId });
      loadFight(tokenOrId, isToken);
    });
  }, [router, fightId, loadFight]);

  useEffect(() => {
    if (!fightId || !session) return;
    const supabase = createBrowserClient();
    if (!supabase) return;
    const channel = supabase
      .channel("fight-" + fightId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fights", filter: `id=eq.${fightId}` },
        () => {
          loadFight(session.tokenOrId, session.isToken);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fightId, session, loadFight]);

  const handleEndFight = async (winnerUserId: string) => {
    if (!session) return;
    setEndingFor(winnerUserId);
    setError(null);
    try {
      const res = await endFightArenaFight(session.tokenOrId, session.isToken, fightId, winnerUserId);
      setFight(res.fight);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end fight");
    } finally {
      setEndingFor(null);
    }
  };

  if (!session && !loading) return null;

  return (
    <div className="arena-bg space-y-6 rounded-2xl p-4 tablet:p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/fight-arena/lobby"
          className="text-sm font-medium text-amber-400/90 hover:text-amber-300"
        >
          ← Lobby
        </Link>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-fintech-muted">Loading fight…</p>
      ) : !fight ? (
        <p className="text-fintech-muted">Fight not found.</p>
      ) : (
        <div className="arena-border arena-glow card-lux rounded-2xl border p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase text-fintech-muted">
              {fight.status}
            </span>
            <span className="text-lg font-bold text-amber-400/90">
              Pot: {formatCents(fight.total_pot)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center">
              <p className="text-xs text-fintech-muted">Host</p>
              <p className="mt-1 font-mono text-sm text-white">
                {fight.host_user_id.slice(0, 8)}…
              </p>
              <p className="mt-1 text-amber-400/90">{formatCents(fight.entry_fee)} entry</p>
              {fight.winner_user_id === fight.host_user_id && (
                <p className="mt-2 text-sm font-semibold text-amber-400">Winner</p>
              )}
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-center">
              <p className="text-xs text-fintech-muted">Opponent</p>
              {fight.opponent_user_id ? (
                <>
                  <p className="mt-1 font-mono text-sm text-white">
                    {fight.opponent_user_id.slice(0, 8)}…
                  </p>
                  <p className="mt-1 text-fintech-muted">{formatCents(fight.entry_fee)} entry</p>
                  {fight.winner_user_id === fight.opponent_user_id && (
                    <p className="mt-2 text-sm font-semibold text-amber-400">Winner</p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-fintech-muted">Waiting…</p>
              )}
            </div>
          </div>

          {fight.status === "active" &&
            session &&
            (session.userId === fight.host_user_id || session.userId === fight.opponent_user_id) && (
              <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-4">
                <p className="text-xs text-fintech-muted">Declare winner (only in testing)</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEndFight(fight.host_user_id)}
                    disabled={!!endingFor}
                    className="min-h-touch flex-1 rounded-xl border border-amber-500/50 bg-amber-500/10 py-2 text-sm font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                  >
                    {endingFor === fight.host_user_id ? "Ending…" : "Host wins"}
                  </button>
                  {fight.opponent_user_id && (
                    <button
                      type="button"
                      onClick={() => handleEndFight(fight.opponent_user_id!)}
                      disabled={!!endingFor}
                      className="min-h-touch flex-1 rounded-xl border border-white/20 bg-white/5 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      {endingFor === fight.opponent_user_id ? "Ending…" : "Opponent wins"}
                    </button>
                  )}
                </div>
              </div>
            )}

          {fight.status === "completed" && (
            <p className="mt-4 text-center text-sm text-fintech-muted">
              Match complete. Winner received {formatCents(fight.total_pot - fight.platform_fee)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
