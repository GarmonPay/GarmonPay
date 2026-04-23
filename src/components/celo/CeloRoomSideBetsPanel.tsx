"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCeloApi } from "@/lib/celo-api-fetch";
import { CELO_SIDEBET_ODDS, CELO_SIDEBET_TYPES } from "@/lib/celo-sidebet-odds";

export type CeloSideBetRow = {
  id: string;
  bet_type: string;
  amount_cents: number;
  status: string;
  odds_multiplier: number;
  creator_id: string;
  acceptor_id: string | null;
  created_at: string;
  expires_at?: string | null;
};

type Props = {
  bets: CeloSideBetRow[];
  loading?: boolean;
  className?: string;
  supabase: SupabaseClient | null;
  me: string | null;
  roomId: string;
  /** Active round id for attribution (optional). */
  roundId?: string | null;
  minAmount?: number;
  onAfterMutate?: () => void;
};

const CELO_DEBUG = process.env.NODE_ENV === "development";

function isExpiredOpen(b: CeloSideBetRow): boolean {
  if (b.status !== "open") return false;
  if (!b.expires_at) return false;
  return new Date(b.expires_at).getTime() < Date.now();
}

export function CeloRoomSideBetsPanel({
  bets,
  loading,
  className = "",
  supabase,
  me,
  roomId,
  roundId,
  minAmount = 100,
  onAfterMutate,
}: Props) {
  const [betType, setBetType] = useState<string>(CELO_SIDEBET_TYPES[0] ?? "celo");
  const [amount, setAmount] = useState(minAmount);
  const [busy, setBusy] = useState<"create" | "accept" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const acceptBusyRef = useRef<Set<string>>(new Set());

  const visibleBets = useMemo(
    () => bets.filter((b) => !isExpiredOpen(b)),
    [bets]
  );

  const refresh = useCallback(() => {
    onAfterMutate?.();
  }, [onAfterMutate]);

  const createIdempotencyRef = useRef<string | null>(null);

  const postCreate = useCallback(async () => {
    if (!supabase || !me || !roomId) {
      setError("Sign in to post a side entry.");
      return;
    }
    if (busy) return;
    setError(null);
    setHint(null);
    setBusy("create");
    const idem = createIdempotencyRef.current ?? crypto.randomUUID();
    createIdempotencyRef.current = idem;
    try {
      if (CELO_DEBUG) {
        console.log("[C-Lo side bets] create request", {
          roomId,
          roundId,
          betType,
          amount_sc: amount,
          idempotency_key: idem,
        });
      }
      const res = await fetchCeloApi(supabase, "/api/celo/sidebet/create", {
        method: "POST",
        body: JSON.stringify({
          room_id: roomId,
          round_id: roundId ?? undefined,
          bet_type: betType,
          amount_sc: amount,
          idempotency_key: idem,
        }),
      });
      const j = (await res.json()) as { error?: string; sideBet?: unknown };
      if (CELO_DEBUG) {
        console.log("[C-Lo side bets] create response", res.status, j);
      }
      if (!res.ok) {
        if (res.status === 401) {
          setError("Session expired. Sign in again.");
          return;
        }
        setError(j.error ?? "Could not post side entry");
        return;
      }
      createIdempotencyRef.current = null;
      setHint("Side entry posted.");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(null);
    }
  }, [supabase, me, roomId, roundId, betType, amount, busy, refresh]);

  const postAccept = useCallback(
    async (betId: string) => {
      if (!supabase || !me) {
        setError("Sign in to match an entry.");
        return;
      }
      if (acceptBusyRef.current.has(betId)) return;
      acceptBusyRef.current.add(betId);
      setError(null);
      setHint(null);
      setBusy("accept");
      try {
        if (CELO_DEBUG) {
          console.log("[C-Lo side bets] accept request", { betId });
        }
        const res = await fetchCeloApi(supabase, "/api/celo/sidebet/accept", {
          method: "POST",
          body: JSON.stringify({ bet_id: betId }),
        });
        const j = (await res.json()) as { error?: string };
        if (CELO_DEBUG) {
          console.log("[C-Lo side bets] accept response", res.status, j);
        }
        if (!res.ok) {
          if (res.status === 401) {
            setError("Session expired. Sign in again.");
            return;
          }
          setError(j.error ?? "Could not match entry");
          return;
        }
        setHint("Matched.");
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        acceptBusyRef.current.delete(betId);
        setBusy(null);
      }
    },
    [supabase, me, refresh]
  );

  const canInteract = !!(supabase && me && roomId);

  return (
    <div
      className={`flex min-h-[120px] flex-1 flex-col border-b border-purple-500/20 ${className}`}
    >
      <div className="shrink-0 border-b border-white/5 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-200/80">
        Side entries
      </div>

      <div className="shrink-0 space-y-2 border-b border-white/5 px-2 py-2">
        <p className="text-[10px] leading-snug text-zinc-500">
          Post a proposition; another player at the table can match it. Funds move on the server when you post or match.
        </p>
        <div className="flex flex-wrap gap-1">
          {CELO_SIDEBET_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              disabled={!canInteract || busy !== null}
              onClick={() => setBetType(t)}
              className="min-h-touch rounded-md border px-1.5 py-1 text-[10px] capitalize transition"
              style={{
                borderColor:
                  betType === t ? "rgba(245,200,66,0.55)" : "rgba(255,255,255,0.08)",
                background:
                  betType === t ? "rgba(245,200,66,0.12)" : "rgba(0,0,0,0.2)",
                color: betType === t ? "#F5C842" : "#9CA3AF",
              }}
            >
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 font-mono text-[10px] text-zinc-400">
            GPC
            <input
              type="number"
              min={minAmount}
              step={100}
              value={amount}
              disabled={!canInteract || busy !== null}
              onChange={(e) =>
                setAmount(Math.max(minAmount, Math.floor(Number(e.target.value) || 0)))
              }
              className="w-24 min-h-9 rounded border border-white/10 bg-black/40 px-2 text-amber-100"
            />
          </label>
          <span className="font-mono text-[10px] text-amber-200/60">
            ×{CELO_SIDEBET_ODDS[betType] ?? "—"}
          </span>
          <button
            type="button"
            disabled={!canInteract || busy !== null}
            onClick={() => void postCreate()}
            className="min-h-9 rounded-lg px-3 text-[11px] font-bold text-zinc-950 disabled:opacity-40"
            style={{
              background: "linear-gradient(135deg, #F5C842, #B8860B)",
            }}
          >
            {busy === "create" ? "Posting…" : "Post entry"}
          </button>
        </div>
        {hint && (
          <p className="text-center text-[11px] text-emerald-300/90">{hint}</p>
        )}
        {error && (
          <p className="text-center text-[11px] text-red-300/95">{error}</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <p className="text-center text-[11px] text-white/30">Loading…</p>
        ) : visibleBets.length === 0 ? (
          <div className="rounded-xl border border-amber-400/10 bg-black/25 px-3 py-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-amber-200/50">
              Table quiet
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-amber-100/45">
              No open side action yet. Post an entry above — it appears here instantly for everyone at the table.
            </p>
          </div>
        ) : (
          <ul className="space-y-2 text-[11px]">
            {visibleBets.map((b) => {
              const mine = me && b.creator_id === me;
              const canAccept =
                me &&
                b.status === "open" &&
                b.creator_id !== me &&
                !isExpiredOpen(b) &&
                busy === null;
              const statusLabel =
                b.status === "open"
                  ? "Open"
                  : b.status === "matched"
                    ? "Matched"
                    : b.status === "locked"
                      ? "Locked"
                      : b.status;
              return (
                <li
                  key={b.id}
                  className="rounded-lg border border-yellow-500/15 bg-black/30 px-2.5 py-2 text-[#C4B5FD]/95 shadow-[0_4px_16px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="font-mono font-medium text-amber-200/95">
                      {b.bet_type.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-[10px] text-white/35">
                      {statusLabel}
                      {mine ? " · Yours" : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-zinc-400">
                    {Math.max(0, b.amount_cents).toLocaleString()} GPC
                    <span className="mx-1 text-white/25">·</span>@
                    {String(b.odds_multiplier)}×
                  </div>
                  {canAccept && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void postAccept(b.id)}
                      className="mt-2 w-full min-h-9 rounded-md border border-amber-400/35 bg-amber-400/10 text-[11px] font-semibold text-amber-200 transition hover:bg-amber-400/15 disabled:opacity-40"
                    >
                      {busy === "accept" ? "Matching…" : "Match this entry"}
                    </button>
                  )}
                  {b.status === "matched" && b.acceptor_id && (
                    <p className="mt-1 text-[10px] text-zinc-500">
                      Matched{b.acceptor_id === me ? " · You matched" : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {CELO_DEBUG && (
          <p className="mt-2 font-mono text-[9px] text-zinc-600">
            list:{visibleBets.length} raw:{bets.length}
          </p>
        )}
      </div>
    </div>
  );
}
