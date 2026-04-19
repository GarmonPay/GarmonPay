"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { CoinFlip3D } from "@/components/games/CoinFlip3D";
import { useCoins } from "@/hooks/useCoins";

const MIN_BET = 100;
const BET_PRESETS = [100, 500, 1000, 2500] as const;
const API = "/api/coin-flip";
/** Minimum spin duration before revealing server result (matches product spec). */
const FLIP_ANIM_MS = 3000;
/** Pause after coin lands before showing win/loss copy. */
const RESULT_SETTLE_MS = 400;
const BG = "#0e0118";
const GOLD = "#f5c842";

type Tab = "house" | "player";

type OpenGame = {
  id: string;
  createdAt: string;
  betAmountMinor: number;
  creatorSide: string;
  creatorLabel: string;
};

type HistoryRow = {
  id: string;
  createdAt: string;
  mode: string;
  status: string;
  betAmountMinor: number;
  result: string | null;
  won: boolean | null;
  netMinor: number;
};

type PendingFlip = {
  youWon: boolean;
  netMinor: number;
  mode: string;
};

export function CoinFlipPanel() {
  const { sweepsCoins, formatGPC, refresh, applyServerGpayBalance } = useCoins();
  const [token, setToken] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [tab, setTab] = useState<Tab>("house");

  const [bet, setBet] = useState(100);
  const [sideHouse, setSideHouse] = useState<"heads" | "tails">("heads");
  const [sideCreate, setSideCreate] = useState<"heads" | "tails">("heads");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flipGeneration, setFlipGeneration] = useState(0);
  const [targetFace, setTargetFace] = useState<"heads" | "tails" | null>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const [won, setWon] = useState<boolean | null>(null);
  const pendingRef = useRef<PendingFlip | null>(null);

  const [lastResult, setLastResult] = useState<{
    result: "heads" | "tails";
    youWon: boolean;
    netMinor: number;
    mode: string;
  } | null>(null);

  const [openGames, setOpenGames] = useState<OpenGame[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const authHeaders = useCallback(
    (json = true) => {
      const h: Record<string, string> = {};
      if (json) h["Content-Type"] = "application/json";
      if (token) h.Authorization = `Bearer ${token}`;
      return h;
    },
    [token]
  );

  const loadHistory = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${API}/history`, {
      credentials: "include",
      headers: authHeaders(false),
    });
    if (r.ok) {
      const d = await r.json();
      setHistory(Array.isArray(d.games) ? d.games : []);
    }
  }, [token, authHeaders]);

  const loadOpen = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${API}/open`, {
      credentials: "include",
      headers: authHeaders(false),
    });
    if (r.ok) {
      const d = await r.json();
      setOpenGames(Array.isArray(d.games) ? d.games : []);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) {
      setLoadingSession(false);
      return;
    }

    const syncFromSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const u = session?.user as { email_confirmed_at?: string | null } | undefined;
      if (!session?.user || u?.email_confirmed_at == null || u?.email_confirmed_at === "") {
        setToken(null);
      } else {
        setToken(session.access_token);
      }
      setLoadingSession(false);
    };

    void syncFromSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void syncFromSession();
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) return;
    void refresh();
    loadHistory();
    loadOpen();
  }, [token, refresh, loadHistory, loadOpen]);

  const handleCoinResult = useCallback(
    (resultFace: "heads" | "tails") => {
      const p = pendingRef.current;
      window.setTimeout(() => {
        setIsFlipping(false);
        setLastResult({
          result: resultFace,
          youWon: p?.youWon ?? false,
          netMinor: typeof p?.netMinor === "number" ? p.netMinor : 0,
          mode: p?.mode ?? "vs_house",
        });
        pendingRef.current = null;
        setBusy(false);
        void refresh();
        loadHistory();
        loadOpen();
      }, RESULT_SETTLE_MS);
    },
    [refresh, loadHistory, loadOpen]
  );

  const betAmountMinor = Math.floor(bet);
  const canAfford = sweepsCoins >= betAmountMinor;
  const betValid = Number.isFinite(bet) && betAmountMinor >= MIN_BET;
  const flipDisabled = busy || isFlipping || !betValid || !canAfford;
  const joinDisabled = busy || isFlipping;

  async function handleVsHouse() {
    if (!token || busy || isFlipping || !betValid || !canAfford) return;
    setError(null);
    setLastResult(null);
    setWon(null);
    setTargetFace(null);
    setIsFlipping(true);
    setFlipGeneration((g) => g + 1);
    setBusy(true);
    try {
      const balanceBefore = sweepsCoins;
      const d = await Promise.all([
        (async () => {
          const r = await fetch(`${API}/create`, {
            method: "POST",
            credentials: "include",
            headers: authHeaders(),
            body: JSON.stringify({ betAmountMinor: betAmountMinor, side: sideHouse, mode: "vs_house" }),
          });
          const j = (await r.json().catch(() => ({}))) as {
            message?: string;
            result?: string;
            youWon?: boolean;
            netMinor?: number;
            new_balance?: number;
            gpayCoins?: number;
          };
          if (!r.ok) {
            throw new Error(typeof j.message === "string" ? j.message : "Flip failed");
          }
          return j;
        })(),
        new Promise<void>((resolve) => setTimeout(resolve, FLIP_ANIM_MS)),
      ]).then(([data]) => data);

      const authoritative =
        typeof d.gpayCoins === "number"
          ? d.gpayCoins
          : typeof d.new_balance === "number"
            ? d.new_balance
            : null;
      if (authoritative != null) {
        applyServerGpayBalance(authoritative);
      }
      const refreshed = await refresh();
      console.info("[coin-flip client] vs_house settled", {
        youWon: d.youWon,
        netMinor: d.netMinor,
        serverGpayCoins: authoritative,
        balanceBefore,
        balanceAfterRefresh: refreshed?.gpayCoins,
      });

      const res: "heads" | "tails" = d.result === "tails" ? "tails" : "heads";
      pendingRef.current = {
        youWon: !!d.youWon,
        netMinor: typeof d.netMinor === "number" ? d.netMinor : 0,
        mode: "vs_house",
      };
      setWon(!!d.youWon);
      setTargetFace(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Flip failed");
      setIsFlipping(false);
      setTargetFace(null);
      setBusy(false);
    }
  }

  async function handleCreatePlayer() {
    if (!token) return;
    setError(null);
    if (!betValid || sweepsCoins < betAmountMinor) {
      setError(`Minimum bet is ${MIN_BET} GPC and sufficient balance required`);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API}/create`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ betAmountMinor: betAmountMinor, side: sideCreate, mode: "vs_player" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof d.message === "string" ? d.message : "Create failed");
        return;
      }
      const j = d as { gpayCoins?: number; new_balance?: number };
      const authoritative =
        typeof j.gpayCoins === "number"
          ? j.gpayCoins
          : typeof j.new_balance === "number"
            ? j.new_balance
            : null;
      if (authoritative != null) {
        applyServerGpayBalance(authoritative);
      }
      await refresh();
      loadOpen();
      loadHistory();
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(gameId: string) {
    if (!token || busy || isFlipping) return;
    setError(null);
    setLastResult(null);
    setWon(null);
    setTargetFace(null);
    setIsFlipping(true);
    setFlipGeneration((g) => g + 1);
    setBusy(true);
    try {
      const balanceBefore = sweepsCoins;
      const d = await Promise.all([
        (async () => {
          const r = await fetch(`${API}/join`, {
            method: "POST",
            credentials: "include",
            headers: authHeaders(),
            body: JSON.stringify({ gameId }),
          });
          const j = (await r.json().catch(() => ({}))) as {
            message?: string;
            result?: string;
            youWon?: boolean;
            netMinor?: number;
            gpayCoins?: number;
            new_balance?: number;
          };
          if (!r.ok) {
            throw new Error(typeof j.message === "string" ? j.message : "Join failed");
          }
          return j;
        })(),
        new Promise<void>((resolve) => setTimeout(resolve, FLIP_ANIM_MS)),
      ]).then(([data]) => data);

      const authoritative =
        typeof d.gpayCoins === "number"
          ? d.gpayCoins
          : typeof d.new_balance === "number"
            ? d.new_balance
            : null;
      if (authoritative != null) {
        applyServerGpayBalance(authoritative);
      }
      const refreshed = await refresh();
      console.info("[coin-flip client] vs_player join settled", {
        youWon: d.youWon,
        netMinor: d.netMinor,
        serverGpayCoins: authoritative,
        balanceBefore,
        balanceAfterRefresh: refreshed?.gpayCoins,
      });

      const res: "heads" | "tails" = d.result === "tails" ? "tails" : "heads";
      pendingRef.current = {
        youWon: !!d.youWon,
        netMinor: typeof d.netMinor === "number" ? d.netMinor : 0,
        mode: "vs_player",
      };
      setWon(!!d.youWon);
      setTargetFace(res);
      loadOpen();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Join failed");
      setIsFlipping(false);
      setTargetFace(null);
      setBusy(false);
      loadOpen();
    }
  }

  if (loadingSession) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 text-center text-fintech-muted">Loading…</div>
    );
  }

  if (!token) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 text-center">
        <p className="text-fintech-muted">Sign in to play Coin Flip with GPay Coins (GPC).</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10" style={{ backgroundColor: BG }}>
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" style={{ color: GOLD }}>
          Coin Flip
        </h1>
        <p className="text-sm text-white/70 mt-1">
          GPay Coins (GPC) — 10% house edge on the doubled pot. Minimum bet {MIN_BET} GPC.
        </p>
        <p className="text-sm mt-2 font-medium" style={{ color: GOLD }}>
          Balance: {formatGPC(sweepsCoins)}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex justify-between gap-4">
          <span>{error}</span>
          <button type="button" className="underline shrink-0" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <CoinFlip3D
        flipGeneration={flipGeneration}
        result={targetFace}
        isFlipping={isFlipping}
        playerWon={won}
        onResult={handleCoinResult}
      />

      {lastResult && !isFlipping && (
        <div
          className="rounded-xl border border-white/10 px-5 py-4 text-center bg-fintech-bg-card"
          style={{ boxShadow: lastResult.youWon ? `0 0 24px ${GOLD}33` : undefined }}
        >
          <p className="text-lg font-semibold" style={{ color: GOLD }}>
            {lastResult.youWon ? "You won" : "You lost"} — {lastResult.result.toUpperCase()}
          </p>
          <p
            className={`text-sm mt-1 font-semibold tabular-nums ${lastResult.netMinor >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {lastResult.netMinor >= 0 ? "+" : "−"}
            {Math.abs(Math.floor(lastResult.netMinor)).toLocaleString()} GPC
          </p>
        </div>
      )}

      <div className="flex rounded-xl border border-white/10 bg-black/20 p-1 max-w-md">
        <button
          type="button"
          onClick={() => setTab("house")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
            tab === "house" ? "bg-fintech-accent text-white" : "text-white/60 hover:text-white"
          }`}
        >
          VS House
        </button>
        <button
          type="button"
          onClick={() => setTab("player")}
          className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
            tab === "player" ? "bg-fintech-accent text-white" : "text-white/60 hover:text-white"
          }`}
        >
          VS Player
        </button>
      </div>

      {tab === "house" && (
        <section className="rounded-xl border border-white/10 bg-fintech-bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Play vs House</h2>
          <div>
            <span className="text-xs text-white/50 uppercase tracking-wider">Bet (GPC)</span>
            <input
              type="number"
              min={MIN_BET}
              step={1}
              value={bet}
              onChange={(e) => setBet(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {BET_PRESETS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setBet(q)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold border transition-colors ${
                    bet === q
                      ? "border-[#f5c842] text-[#f5c842] bg-[#f5c842]/10"
                      : "border-white/10 text-white/70 hover:border-white/20"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/50 mb-2">Your side</p>
            <div className="flex gap-2">
              {(["heads", "tails"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSideHouse(s)}
                  className={`flex-1 rounded-xl py-3 font-semibold capitalize border ${
                    sideHouse === s
                      ? "border-[#f5c842] bg-[#f5c842]/15 text-[#f5c842]"
                      : "border-white/10 text-white/60 hover:border-white/20"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={flipDisabled}
            onClick={handleVsHouse}
            className="w-full rounded-xl bg-fintech-accent py-3.5 font-semibold text-white hover:opacity-95 disabled:opacity-40"
          >
            {busy || isFlipping ? "Flipping…" : "Flip"}
          </button>
        </section>
      )}

      {tab === "player" && (
        <div className="space-y-6">
          <section className="rounded-xl border border-white/10 bg-fintech-bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Create game</h2>
            <div>
              <span className="text-xs text-white/50 uppercase tracking-wider">Bet (GPC)</span>
              <input
                type="number"
                min={MIN_BET}
                step={1}
                value={bet}
                onChange={(e) => setBet(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white"
              />
              <div className="flex flex-wrap gap-2 mt-3">
                {BET_PRESETS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setBet(q)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold border transition-colors ${
                      bet === q
                        ? "border-[#f5c842] text-[#f5c842] bg-[#f5c842]/10"
                        : "border-white/10 text-white/70 hover:border-white/20"
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Your side</p>
              <div className="flex gap-2">
                {(["heads", "tails"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSideCreate(s)}
                    className={`flex-1 rounded-xl py-3 font-semibold capitalize border ${
                      sideCreate === s
                        ? "border-[#f5c842] bg-[#f5c842]/15 text-[#f5c842]"
                        : "border-white/10 text-white/60 hover:border-white/20"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={busy || !betValid || sweepsCoins < betAmountMinor}
              onClick={handleCreatePlayer}
              className="w-full rounded-xl border border-[#f5c842]/40 bg-[#f5c842]/10 py-3.5 font-semibold text-[#f5c842] hover:bg-[#f5c842]/15 disabled:opacity-40"
            >
              {busy ? "Working…" : "Create & stake"}
            </button>
          </section>

          <section className="rounded-xl border border-white/10 bg-fintech-bg-card p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Open games</h2>
            {openGames.length === 0 ? (
              <p className="text-sm text-white/50">No open games — create one or check back soon.</p>
            ) : (
              <ul className="space-y-3">
                {openGames.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-3"
                  >
                    <div>
                      <p className="text-sm text-white font-medium">{g.creatorLabel}</p>
                      <p className="text-xs text-white/50">
                        {formatGPC(g.betAmountMinor)} · plays {g.creatorSide}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={joinDisabled}
                      onClick={() => handleJoin(g.id)}
                      className="rounded-xl bg-fintech-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Join
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={loadOpen} className="mt-4 text-sm text-[#7c3aed] hover:underline">
              Refresh list
            </button>
          </section>
        </div>
      )}

      <section className="rounded-xl border border-white/10 bg-fintech-bg-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recent flips</h2>
        {history.length === 0 ? (
          <p className="text-sm text-white/50">No history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-white/50 border-b border-white/10">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Mode</th>
                  <th className="pb-2 pr-3">Bet</th>
                  <th className="pb-2 pr-3">Result</th>
                  <th className="pb-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-white/5 text-white/60">
                    <td className="py-2 pr-3 whitespace-nowrap text-white/90">
                      {h.createdAt ? new Date(h.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-3">{h.mode === "vs_house" ? "House" : "Player"}</td>
                    <td className="py-2 pr-3">{formatGPC(h.betAmountMinor)}</td>
                    <td className="py-2 pr-3">{h.result ?? "—"}</td>
                    <td
                      className={`py-2 tabular-nums ${h.netMinor > 0 ? "text-emerald-400" : h.netMinor < 0 ? "text-red-400" : ""}`}
                    >
                      {h.status === "completed" ? (
                        <>
                          {h.netMinor >= 0 ? "+" : "−"}
                          {Math.abs(Math.floor(h.netMinor)).toLocaleString()} GPC
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default CoinFlipPanel;
