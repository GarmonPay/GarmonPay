"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { BannerRotator } from "@/components/banners/BannerRotator";

type LeaderboardRow = {
  rank: number;
  session_id: string;
  user_id: string;
  email: string;
  escape_time_seconds: number;
  prize_cents: number;
  mode: "free" | "stake";
};

type LobbySnapshot = {
  settings: {
    free_play_enabled: boolean;
    stake_mode_enabled: boolean;
    min_stake_cents: number;
    max_stake_cents: number;
    platform_fee_percent: number;
    countdown_seconds: number;
    maintenance_banner: string | null;
  };
  liveSessions: Array<{
    id: string;
    email: string;
    mode: "free" | "stake";
    stake_cents: number;
    elapsed_seconds: number;
  }>;
  prizePool: {
    prize_pool_window: string;
    total_staked_cents: number;
    platform_fee_cents: number;
    distributable_cents: number;
    stake_players: number;
  };
  leaderboard: LeaderboardRow[];
  wallet_balance_cents: number;
  user: { id: string; email: string };
};

type StartResponse = {
  ok: true;
  session: {
    id: string;
    mode: "free" | "stake";
    stake_cents: number;
    started_at: string;
    countdown_seconds: number;
    prize_pool_window: string;
  };
  puzzle: {
    id: string;
    puzzle_name: string;
    clue_transaction_id: string;
    clue_formula: string;
    clue_terminal_text: string | null;
    clue_cabinet_text: string | null;
    difficulty_level: "easy" | "medium" | "hard" | "expert";
    active_date: string;
    preview_text: string | null;
  };
  wallet_balance_cents: number;
};

function cents(n: number) {
  return `$${(Number(n || 0) / 100).toFixed(2)}`;
}

function mmss(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function EscapeRoomClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [mode, setMode] = useState<"free" | "stake">("free");
  const [stakeInput, setStakeInput] = useState("1.00");
  const [starting, setStarting] = useState(false);
  const refreshTimer = useRef<number | null>(null);

  const minStake = snapshot?.settings.min_stake_cents ?? 100;
  const maxStake = snapshot?.settings.max_stake_cents ?? 10000;
  const stakeCents = useMemo(() => Math.round(Number(stakeInput || 0) * 100), [stakeInput]);

  async function loadLobby() {
    const session = await getSessionAsync();
    if (!session) {
      router.replace("/login?next=/escape-room");
      return;
    }
    const tokenOrId = session.accessToken ?? session.userId;
    const isToken = !!session.accessToken;
    const headers: Record<string, string> = isToken
      ? { Authorization: `Bearer ${tokenOrId}` }
      : { "X-User-Id": tokenOrId };

    const lobbyRes = await fetch("/api/games/lobby", {
      headers,
      credentials: "include",
    });
    if (!lobbyRes.ok) {
      const err = await lobbyRes.json().catch(() => ({} as { error?: string; message?: string }));
      throw new Error(err.error ?? err.message ?? "Failed to load lobby");
    }
    const lobby = (await lobbyRes.json()) as LobbySnapshot;

    setSnapshot(lobby);
  }

  useEffect(() => {
    setLoading(true);
    loadLobby()
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load lobby"))
      .finally(() => setLoading(false));
    refreshTimer.current = window.setInterval(() => {
      loadLobby().catch(() => {});
    }, 15000);
    return () => {
      if (refreshTimer.current != null) window.clearInterval(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enterVault() {
    if (!snapshot) return;
    setError(null);
    setStarting(true);
    try {
      const session = await getSessionAsync();
      if (!session) {
        router.replace("/login?next=/escape-room");
        return;
      }
      const tokenOrId = session.accessToken ?? session.userId;
      const isToken = !!session.accessToken;
      const headers = {
        ...(isToken ? { Authorization: `Bearer ${tokenOrId}` } : { "X-User-Id": tokenOrId }),
        "Content-Type": "application/json",
      };
      const payload =
        mode === "stake"
          ? { mode: "stake" as const, stake_cents: Math.max(minStake, Math.min(maxStake, stakeCents)) }
          : { mode: "free" as const };
      const res = await fetch("/api/games/start", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as StartResponse & { error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to enter vault");
      }
      const startPayload = {
        session: data.session,
        puzzle: data.puzzle,
      };
      sessionStorage.setItem("escapeRoomStart", JSON.stringify(startPayload));
      router.push(`/escape-room/play?session=${data.session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start game");
    } finally {
      setStarting(false);
    }
  }

  if (loading || !snapshot) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="rounded-xl border border-white/10 bg-fintech-bg-card/70 p-6 text-fintech-muted">
          Loading Stake & Escape lobby…
        </div>
      </main>
    );
  }

  const settings = snapshot.settings;
  const top3Split = [50, 30, 20];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 space-y-4">
      {settings.maintenance_banner && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm">
          {settings.maintenance_banner}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      <section className="card-lux p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Stake & Escape</h1>
            <p className="text-sm text-fintech-muted">
              Solve the vault faster than everyone else. Server-side timers only.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-fintech-muted uppercase">Wallet</p>
            <p className="text-xl font-bold text-emerald-400">{cents(snapshot.wallet_balance_cents)}</p>
          </div>
        </div>
      </section>

      <BannerRotator placement="dashboard-top" />

      <section className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card-lux p-4 sm:p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode("free")}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                mode === "free"
                  ? "border-fintech-accent bg-fintech-accent/15"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <p className="text-sm font-semibold text-white">Free Play</p>
              <p className="text-xs text-fintech-muted">Ad-supported intro + lose screens</p>
            </button>
            <button
              type="button"
              onClick={() => setMode("stake")}
              disabled={!settings.stake_mode_enabled}
              className={`rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${
                mode === "stake"
                  ? "border-fintech-highlight bg-fintech-highlight/15"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <p className="text-sm font-semibold text-white">Stake Mode</p>
              <p className="text-xs text-fintech-muted">KYC required · Wallet debit on enter</p>
            </button>
          </div>

          {mode === "stake" && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <label className="block text-xs text-fintech-muted uppercase mb-2">Stake amount (USD)</label>
              <input
                type="number"
                min={minStake / 100}
                max={maxStake / 100}
                step="0.5"
                value={stakeInput}
                onChange={(e) => setStakeInput(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-fintech-accent"
              />
              <p className="mt-2 text-xs text-fintech-muted">
                Range: {cents(minStake)} – {cents(maxStake)}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-black/20 border border-white/10 p-3">
              <p className="text-xs text-fintech-muted">Players in window</p>
              <p className="text-lg font-bold text-white">{snapshot.prizePool.stake_players}</p>
            </div>
            <div className="rounded-lg bg-black/20 border border-white/10 p-3">
              <p className="text-xs text-fintech-muted">Total staked</p>
              <p className="text-lg font-bold text-white">
                {cents(snapshot.prizePool.total_staked_cents)}
              </p>
            </div>
            <div className="rounded-lg bg-black/20 border border-white/10 p-3">
              <p className="text-xs text-fintech-muted">Platform fee</p>
              <p className="text-lg font-bold text-emerald-400">
                {cents(snapshot.prizePool.platform_fee_cents)}
              </p>
            </div>
            <div className="rounded-lg bg-black/20 border border-white/10 p-3">
              <p className="text-xs text-fintech-muted">Prize pool</p>
              <p className="text-lg font-bold text-amber-300">
                {cents(snapshot.prizePool.distributable_cents)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={enterVault}
            disabled={
              starting ||
              (mode === "free" && !settings.free_play_enabled) ||
              (mode === "stake" && !settings.stake_mode_enabled)
            }
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-4 py-3 font-semibold text-white shadow-lg shadow-violet-900/40 hover:from-violet-500 hover:to-violet-400 disabled:opacity-50"
          >
            {starting ? "Entering vault..." : "Enter Vault"}
          </button>

          <p className="text-xs text-fintech-muted">
            Top 3 split of distributable pool: {top3Split.join("% / ")}%
          </p>
        </div>

        <div className="card-lux p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
            Active game sessions
          </h2>
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {snapshot.liveSessions.map((s) => (
              <div key={s.id} className="rounded-lg bg-black/20 border border-white/10 p-3">
                <p className="text-sm text-white truncate">{s.email}</p>
                <p className="text-xs text-fintech-muted">
                  {s.mode.toUpperCase()} · Stake {cents(s.stake_cents)} · {mmss(s.elapsed_seconds)}
                </p>
              </div>
            ))}
            {snapshot.liveSessions.length === 0 && (
              <p className="text-sm text-fintech-muted">No active sessions right now.</p>
            )}
          </div>
        </div>
      </section>

      <section className="card-lux p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
          Today&apos;s fastest escapes
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-white/10 text-fintech-muted">
                <th className="pb-2 pr-3">Rank</th>
                <th className="pb-2 pr-3">Member</th>
                <th className="pb-2 pr-3">Mode</th>
                <th className="pb-2 pr-3">Escape Time</th>
                <th className="pb-2 pr-3 text-right">Projected Prize</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.leaderboard.map((row) => (
                <tr key={row.session_id} className="border-b border-white/5">
                  <td className="py-2 pr-3 text-white">#{row.rank}</td>
                  <td className="py-2 pr-3 text-white truncate max-w-[220px]">{row.email}</td>
                  <td className="py-2 pr-3 text-fintech-muted uppercase">{row.mode}</td>
                  <td className="py-2 pr-3 text-white">{mmss(row.escape_time_seconds)}</td>
                  <td className="py-2 pr-3 text-right text-amber-300">{cents(row.prize_cents)}</td>
                </tr>
              ))}
              {snapshot.leaderboard.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-fintech-muted">
                    No successful escapes yet today.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default EscapeRoomClient;
