"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

type Lobby = {
  maintenance_banner?: string | null;
  free_play_enabled: boolean;
  stake_mode_enabled: boolean;
  min_stake_cents: number;
  max_stake_cents: number;
  countdown_seconds: number;
  prize_pool_window: string;
  pool_gross_cents: number;
  pool_net_cents: number;
  active_sessions: number;
  kyc_verified: boolean;
  balance_cents: number;
};

type Board = { rank: number; escape_seconds: number; mode: string; display_name: string };

export default function StakeEscapeLobbyPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [board, setBoard] = useState<Board[]>([]);
  const [stakeCents, setStakeCents] = useState(500);
  const [starting, setStarting] = useState<"free" | "stake" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then(setSession);
  }, []);

  const load = useCallback(async () => {
    const s = await getSessionAsync();
    setSession(s);
    if (!s?.accessToken) return;
    setErr(null);
    try {
      const [lr, br] = await Promise.all([
        fetch(`${apiBase}/api/games/escape/lobby`, { headers: authHeaders(s.accessToken) }).then((r) =>
          r.json()
        ),
        fetch(`${apiBase}/api/games/escape/leaderboard`, { headers: authHeaders(s.accessToken) }).then(
          (r) => r.json()
        ),
      ]);
      if (lr.error && !lr.maintenance_banner) {
        setErr(typeof lr.error === "string" ? lr.error : "Could not load lobby");
        return;
      }
      setLobby(lr as Lobby);
      setBoard((br.entries as Board[]) ?? []);
      const minS = Number(lr.min_stake_cents ?? 100);
      const maxS = Number(lr.max_stake_cents ?? 10000);
      setStakeCents((prev) => Math.max(minS, Math.min(prev, maxS)));
    } catch {
      setErr("Network error");
    }
  }, []);

  useEffect(() => {
    if (session?.accessToken) load();
  }, [session?.accessToken, load]);

  async function enterVault(mode: "free" | "stake") {
    const s = await getSessionAsync();
    if (!s?.accessToken) {
      router.push(`/login?redirect=${encodeURIComponent("/games/escape")}`);
      return;
    }
    setStarting(mode);
    setErr(null);
    const fingerprint =
      typeof window !== "undefined"
        ? btoa(`${navigator.userAgent}|${window.screen.width}x${window.screen.height}`).slice(0, 120)
        : "";
    try {
      const res = await fetch(`${apiBase}/api/games/escape/start`, {
        method: "POST",
        headers: authHeaders(s.accessToken),
        body: JSON.stringify({
          mode,
          stake_cents: mode === "stake" ? stakeCents : 0,
          device_fingerprint: fingerprint,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error === "active_session") {
        router.push(`/games/escape/play?session=${encodeURIComponent(data.session_id)}`);
        return;
      }
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Could not start");
        return;
      }
      router.push(`/games/escape/play?session=${encodeURIComponent(data.session_id)}`);
    } catch {
      setErr("Network error");
    } finally {
      setStarting(null);
    }
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[#0c0618] text-white flex flex-col items-center justify-center px-4">
        <p className="text-violet-200/90 mb-6 text-center">Sign in to access Stake & Escape.</p>
        <Link
          href="/login?redirect=/games/escape"
          className="rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-8 py-3 font-semibold text-white shadow-lg shadow-violet-900/40"
        >
          Log in
        </Link>
        <Link href="/games" className="mt-6 text-sm text-violet-300 underline underline-offset-2">
          ← All games
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0c0618] text-white relative overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-violet-600/25 blur-[100px]" />
        <div className="absolute right-0 bottom-20 h-80 w-80 rounded-full bg-[#eab308]/10 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-lg px-4 py-8 pb-24">
        <p className="text-center text-5xl drop-shadow-[0_0_24px_rgba(139,92,246,0.4)] mb-2">🏦</p>
        <h1 className="text-center text-2xl font-bold bg-gradient-to-r from-[#fde047] via-[#eab308] to-[#a16207] bg-clip-text text-transparent">
          Stake & Escape
        </h1>
        <p className="text-center text-sm text-violet-200/85 mt-2">
          Skill-based vault escape — fastest times win from the daily pool.
        </p>

        {lobby?.maintenance_banner ? (
          <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-200 text-sm">
            {lobby.maintenance_banner}
          </div>
        ) : null}

        {err && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
            {err}
          </div>
        )}

        <div className="mt-8 grid gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#150d24]/95 p-5 shadow-card">
            <div className="flex justify-between text-xs text-violet-300/90 uppercase tracking-wider">
              <span>Daily pool ({lobby?.prize_pool_window ?? "—"})</span>
              <span>{lobby?.active_sessions ?? "—"} active</span>
            </div>
            <p className="mt-2 text-2xl font-semibold text-emerald-400">
              ${((lobby?.pool_net_cents ?? 0) / 100).toFixed(2)}{" "}
              <span className="text-sm font-normal text-violet-200/80">net est.</span>
            </p>
            <p className="text-xs text-violet-400/80 mt-1">
              Gross ${((lobby?.pool_gross_cents ?? 0) / 100).toFixed(2)} · Timer{" "}
              {Math.floor((lobby?.countdown_seconds ?? 600) / 60)} min
            </p>
          </div>

          <div className="rounded-2xl border border-violet-500/30 bg-[#150d24]/95 p-5 shadow-card">
            <h2 className="text-sm font-semibold text-[#fde047]">Free play</h2>
            <p className="text-xs text-violet-200/80 mt-1">Ad-supported · no wallet deduction</p>
            <button
              type="button"
              disabled={!lobby?.free_play_enabled || !!starting}
              onClick={() => enterVault("free")}
              className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 py-3.5 font-semibold text-white disabled:opacity-50 min-h-touch"
            >
              {starting === "free" ? "Entering…" : "Enter Vault — Free"}
            </button>
          </div>

          <div className="rounded-2xl border border-[#eab308]/35 bg-[#150d24]/95 p-5 shadow-[0_0_40px_-12px_rgba(234,179,8,0.25)]">
            <h2 className="text-sm font-semibold text-[#fde047]">Stake mode</h2>
            <p className="text-xs text-violet-200/80 mt-1">
              KYC required · Balance ${((lobby?.balance_cents ?? 0) / 100).toFixed(2)}
            </p>
            {!lobby?.kyc_verified ? (
              <p className="text-xs text-amber-300/90 mt-2">Complete KYC in your profile to unlock staking.</p>
            ) : (
              <div className="mt-3">
                <label className="text-xs text-violet-300">Stake (USD)</label>
                <input
                  type="range"
                  min={lobby?.min_stake_cents ?? 100}
                  max={lobby?.max_stake_cents ?? 10000}
                  step={100}
                  value={Math.min(Math.max(stakeCents, lobby?.min_stake_cents ?? 100), lobby?.max_stake_cents ?? 10000)}
                  onChange={(e) => setStakeCents(Number(e.target.value))}
                  className="w-full mt-1 accent-[#eab308]"
                />
                <p className="text-center text-lg font-semibold text-white mt-1">
                  ${(stakeCents / 100).toFixed(2)}
                </p>
              </div>
            )}
            <button
              type="button"
              disabled={
                !lobby?.stake_mode_enabled || !!starting || !lobby?.kyc_verified || !session?.accessToken
              }
              onClick={() => enterVault("stake")}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 py-3.5 font-semibold text-white shadow-lg shadow-violet-900/40 disabled:opacity-50 min-h-touch"
            >
              {starting === "stake" ? "Entering…" : "Enter Vault — Stake"}
            </button>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#150d24]/90 p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Today&apos;s fastest (top 10)</h2>
          <ul className="space-y-2 text-sm">
            {board.length === 0 && <li className="text-violet-400/80">No finishes yet today.</li>}
            {board.map((e) => (
              <li key={`${e.rank}-${e.display_name}`} className="flex justify-between text-violet-100/90">
                <span>
                  #{e.rank} {e.display_name}
                </span>
                <span className="text-emerald-400 font-mono">{e.escape_seconds}s</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-10 text-center">
          <Link href="/games" className="text-sm text-violet-300 underline underline-offset-2 hover:text-[#fde047]">
            ← Game station
          </Link>
        </p>
      </div>
    </main>
  );
}
