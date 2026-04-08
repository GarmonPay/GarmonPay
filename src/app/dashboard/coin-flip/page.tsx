"use client";

import { useCallback, useEffect, useState } from "react";
import { getSessionAsync } from "@/lib/session";

const MIN_BET = 10;
const API = "/api/coin-flip";

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

function formatGp(n: number) {
  return `${n.toLocaleString()} GP`;
}

export default function CoinFlipPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [balanceMinor, setBalanceMinor] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("house");

  const [betStr, setBetStr] = useState("50");
  const [sideHouse, setSideHouse] = useState<"heads" | "tails">("heads");
  const [sideCreate, setSideCreate] = useState<"heads" | "tails">("heads");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [coinFace, setCoinFace] = useState<"heads" | "tails">("heads");
  const [flipping, setFlipping] = useState(false);
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

  const loadBalance = useCallback(async () => {
    if (!token) return;
    const r = await fetch("/api/gpay/balance", { headers: authHeaders(false) });
    if (r.ok) {
      const d = await r.json();
      setBalanceMinor(typeof d.gpayAvailableBalanceMinor === "number" ? d.gpayAvailableBalanceMinor : 0);
    }
  }, [token, authHeaders]);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${API}/history`, { headers: authHeaders(false) });
    if (r.ok) {
      const d = await r.json();
      setHistory(Array.isArray(d.games) ? d.games : []);
    }
  }, [token, authHeaders]);

  const loadOpen = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${API}/open`, { headers: authHeaders(false) });
    if (r.ok) {
      const d = await r.json();
      setOpenGames(Array.isArray(d.games) ? d.games : []);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    getSessionAsync().then((s) => {
      setToken(s?.accessToken ?? null);
      setLoadingSession(false);
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    loadBalance();
    loadHistory();
    loadOpen();
  }, [token, loadBalance, loadHistory, loadOpen]);

  async function runFlipAnimation(result: "heads" | "tails") {
    setFlipping(true);
    setCoinFace(result);
    await new Promise((r) => setTimeout(r, 2200));
    setFlipping(false);
  }

  async function handleVsHouse() {
    if (!token) return;
    setError(null);
    const bet = Math.floor(Number(betStr));
    if (!Number.isFinite(bet) || bet < MIN_BET) {
      setError(`Minimum bet is ${MIN_BET} GP`);
      return;
    }
    setBusy(true);
    setLastResult(null);
    try {
      const r = await fetch(`${API}/create`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ betAmountMinor: bet, side: sideHouse, mode: "vs_house" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof d.message === "string" ? d.message : "Flip failed");
        return;
      }
      const res = d.result === "tails" ? "tails" : "heads";
      await runFlipAnimation(res);
      setLastResult({
        result: res,
        youWon: !!d.youWon,
        netMinor: typeof d.netMinor === "number" ? d.netMinor : 0,
        mode: "vs_house",
      });
      if (typeof d.gpayBalanceMinor === "number") setBalanceMinor(d.gpayBalanceMinor);
      else loadBalance();
      loadHistory();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePlayer() {
    if (!token) return;
    setError(null);
    const bet = Math.floor(Number(betStr));
    if (!Number.isFinite(bet) || bet < MIN_BET) {
      setError(`Minimum bet is ${MIN_BET} GP`);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${API}/create`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ betAmountMinor: bet, side: sideCreate, mode: "vs_player" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof d.message === "string" ? d.message : "Create failed");
        return;
      }
      if (typeof d.gpayBalanceMinor === "number") setBalanceMinor(d.gpayBalanceMinor);
      loadOpen();
      loadHistory();
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(gameId: string) {
    if (!token) return;
    setError(null);
    setBusy(true);
    setLastResult(null);
    try {
      const r = await fetch(`${API}/join`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ gameId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(typeof d.message === "string" ? d.message : "Join failed");
        loadOpen();
        return;
      }
      const res = d.result === "tails" ? "tails" : "heads";
      await runFlipAnimation(res);
      setLastResult({
        result: res,
        youWon: !!d.youWon,
        netMinor: typeof d.netMinor === "number" ? d.netMinor : 0,
        mode: "vs_player",
      });
      if (typeof d.gpayBalanceMinor === "number") setBalanceMinor(d.gpayBalanceMinor);
      else loadBalance();
      loadOpen();
      loadHistory();
    } finally {
      setBusy(false);
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
        <p className="text-fintech-muted">Sign in to play Coin Flip with GPay.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Coin Flip</h1>
        <p className="text-sm text-fintech-muted mt-1">
          GPay only — 10% house edge on the 2× pot. Minimum bet {MIN_BET} GP.
        </p>
        <p className="text-sm text-fintech-highlight mt-2 font-medium">
          Balance: {balanceMinor != null ? formatGp(balanceMinor) : "—"}
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

      {/* Coin display */}
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="relative h-36 w-36 [perspective:800px]">
          <div
            className={`absolute inset-0 rounded-full border-4 border-fintech-highlight/80 shadow-[0_0_40px_rgba(212,175,55,0.35)] flex items-center justify-center text-4xl font-bold bg-gradient-to-br from-amber-700 via-amber-500 to-yellow-200 text-amber-950 [transform-style:preserve-3d] [backface-visibility:hidden] ${
              flipping ? "animate-coin-flip-spin" : ""
            }`}
          >
            {coinFace === "heads" ? "H" : "T"}
          </div>
        </div>
        {lastResult && !flipping && (
          <div className="text-center">
            <p className="text-lg font-semibold text-fintech-highlight">
              {lastResult.result.toUpperCase()} — {lastResult.youWon ? "You won!" : "You lost"}
            </p>
            <p className={`text-sm mt-1 ${lastResult.netMinor >= 0 ? "text-emerald-400" : "text-red-300"}`}>
              {lastResult.netMinor >= 0 ? "+" : ""}
              {formatGp(lastResult.netMinor)} (net)
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-white/10 bg-black/20 p-1 max-w-md">
        <button
          type="button"
          onClick={() => setTab("house")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            tab === "house" ? "bg-fintech-accent text-white" : "text-fintech-muted hover:text-white"
          }`}
        >
          VS House
        </button>
        <button
          type="button"
          onClick={() => setTab("player")}
          className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
            tab === "player" ? "bg-fintech-accent text-white" : "text-fintech-muted hover:text-white"
          }`}
        >
          VS Player
        </button>
      </div>

      {tab === "house" && (
        <section className="rounded-xl border border-white/10 bg-fintech-bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Play vs House</h2>
          <label className="block">
            <span className="text-xs text-fintech-muted uppercase tracking-wider">Bet (GP)</span>
            <input
              type="number"
              min={MIN_BET}
              step={1}
              value={betStr}
              onChange={(e) => setBetStr(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </label>
          <div>
            <p className="text-xs text-fintech-muted mb-2">Your side</p>
            <div className="flex gap-2">
              {(["heads", "tails"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSideHouse(s)}
                  className={`flex-1 rounded-lg py-3 font-semibold capitalize border ${
                    sideHouse === s
                      ? "border-fintech-highlight bg-fintech-highlight/20 text-fintech-highlight"
                      : "border-white/10 text-fintech-muted hover:border-white/20"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handleVsHouse}
            className="w-full rounded-xl bg-fintech-accent py-3 font-semibold text-white hover:bg-fintech-accent/90 disabled:opacity-50"
          >
            {busy ? "Flipping…" : "Flip"}
          </button>
        </section>
      )}

      {tab === "player" && (
        <div className="space-y-6">
          <section className="rounded-xl border border-white/10 bg-fintech-bg-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Create game</h2>
            <label className="block">
              <span className="text-xs text-fintech-muted uppercase tracking-wider">Bet (GP)</span>
              <input
                type="number"
                min={MIN_BET}
                step={1}
                value={betStr}
                onChange={(e) => setBetStr(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
              />
            </label>
            <div>
              <p className="text-xs text-fintech-muted mb-2">Your side</p>
              <div className="flex gap-2">
                {(["heads", "tails"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSideCreate(s)}
                    className={`flex-1 rounded-lg py-3 font-semibold capitalize border ${
                      sideCreate === s
                        ? "border-fintech-highlight bg-fintech-highlight/20 text-fintech-highlight"
                        : "border-white/10 text-fintech-muted hover:border-white/20"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleCreatePlayer}
              className="w-full rounded-xl border border-fintech-highlight/50 bg-fintech-highlight/10 py-3 font-semibold text-fintech-highlight hover:bg-fintech-highlight/20 disabled:opacity-50"
            >
              {busy ? "Working…" : "Create & stake"}
            </button>
          </section>

          <section className="rounded-xl border border-white/10 bg-fintech-bg-card p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Open games</h2>
            {openGames.length === 0 ? (
              <p className="text-sm text-fintech-muted">No open games — create one or check back soon.</p>
            ) : (
              <ul className="space-y-3">
                {openGames.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-3"
                  >
                    <div>
                      <p className="text-sm text-white font-medium">{g.creatorLabel}</p>
                      <p className="text-xs text-fintech-muted">
                        {formatGp(g.betAmountMinor)} · plays {g.creatorSide}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleJoin(g.id)}
                      className="rounded-lg bg-fintech-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Join
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={loadOpen}
              className="mt-4 text-sm text-fintech-accent hover:underline"
            >
              Refresh list
            </button>
          </section>
        </div>
      )}

      <section className="rounded-xl border border-white/10 bg-fintech-bg-card p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recent flips</h2>
        {history.length === 0 ? (
          <p className="text-sm text-fintech-muted">No history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-fintech-muted border-b border-white/10">
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Mode</th>
                  <th className="pb-2 pr-3">Bet</th>
                  <th className="pb-2 pr-3">Result</th>
                  <th className="pb-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-white/5 text-fintech-muted">
                    <td className="py-2 pr-3 whitespace-nowrap text-white/90">
                      {new Date(h.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{h.mode === "vs_house" ? "House" : "Player"}</td>
                    <td className="py-2 pr-3">{formatGp(h.betAmountMinor)}</td>
                    <td className="py-2 pr-3">{h.result ?? "—"}</td>
                    <td className={`py-2 ${h.netMinor > 0 ? "text-emerald-400" : h.netMinor < 0 ? "text-red-300" : ""}`}>
                      {h.status === "completed" ? `${h.netMinor >= 0 ? "+" : ""}${formatGp(h.netMinor)}` : "—"}
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
