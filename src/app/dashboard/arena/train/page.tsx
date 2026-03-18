"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getSessionAsync } from "@/lib/session";
import {
  TRAINING_SESSIONS,
  STAT_CAP,
  isSessionUnlocked,
  type TrainingSessionKey,
  type SignatureMoveKey,
} from "@/lib/arena-training";

import { getApiRoot } from "@/lib/api";
import { getHasWebGL } from "@/lib/webgl-detect";
import { FighterLayers } from "@/components/arena/FighterLayers";
import type { FighterData } from "@/lib/arena-fighter-types";

const BoxingRing3D = dynamic(
  () => import("@/components/arena/BoxingRing3D").then((m) => m.BoxingRing3D),
  { ssr: false }
);

const SIGNATURE_MOVE_NAMES: Record<SignatureMoveKey, string> = {
  THE_HAYMAKER: "The Haymaker",
  COUNTER_HOOK: "Counter Hook",
  BODY_BREAKER: "Body Breaker",
  FLASH_KO: "Flash KO",
  IRON_WILL: "Iron Will",
  THE_FINAL_ROUND: "The Final Round",
};

type FighterStats = FighterData & {
  id: string;
  strength: number;
  speed: number;
  stamina: number;
  defense: number;
  chin: number;
  special: number;
  training_sessions: number;
};

export default function TrainingGymPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fighter, setFighter] = useState<FighterStats | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [trainingSessionKey, setTrainingSessionKey] = useState<TrainingSessionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    stat: string;
    gain: number;
    newValue: number;
    trainingSessions: number;
    unlockedMoves: SignatureMoveKey[];
    balanceCents: number;
  } | null>(null);
  const [unlockToast, setUnlockToast] = useState<SignatureMoveKey[]>([]);

  const fetchData = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const isToken = !!s.accessToken;
    const headers: Record<string, string> = isToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    const [meRes, walletRes] = await Promise.all([
      fetch(`${getApiRoot()}/arena/me`, { headers, credentials: "include" }),
      fetch(`${getApiRoot()}/wallet/get`, { headers, credentials: "include" }),
    ]);
    const meData = meRes.ok ? await meRes.json() : null;
    const walletData = walletRes.ok ? await walletRes.json() : null;
    if (meData?.fighter) setFighter(meData.fighter);
    if (typeof walletData?.balance_cents === "number") setBalanceCents(walletData.balance_cents);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runTraining = async (sessionKey: TrainingSessionKey) => {
    if (!session || !fighter) return;
    setError(null);
    setResult(null);
    setTrainingSessionKey(sessionKey);
    const token = session.accessToken ?? session.userId;
    const isToken = !!session.accessToken;
    const headers: Record<string, string> = isToken
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { "X-User-Id": token, "Content-Type": "application/json" };
    try {
      const res = await fetch(`${getApiRoot()}/arena/train`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ sessionKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Training failed");
        return;
      }
      setResult({
        stat: data.stat,
        gain: data.gain,
        newValue: data.newValue,
        trainingSessions: data.trainingSessions,
        unlockedMoves: data.unlockedMoves ?? [],
        balanceCents: data.balanceCents,
      });
      if (data.balanceCents != null) setBalanceCents(data.balanceCents);
      if (Array.isArray(data.fighter)) {
        setFighter((f) => (f ? { ...f, ...data.fighter } : f));
      } else {
        setFighter((f) => {
          if (!f) return f;
          return {
            ...f,
            [data.stat]: data.newValue,
            training_sessions: data.trainingSessions,
          };
        });
      }
      if (Array.isArray(data.unlockedMoves) && data.unlockedMoves.length > 0) {
        setUnlockToast(data.unlockedMoves);
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setTrainingSessionKey(null);
    }
  };

  if (loading || !session) {
    return (
      <div className="p-6 text-[#9ca3af]">Loading…</div>
    );
  }
  if (!fighter) {
    return (
      <div className="p-6">
        <p className="text-[#9ca3af] mb-4">You don’t have a fighter yet.</p>
        <Link href="/dashboard/arena/create" className="text-[#f0a500] hover:underline">Create fighter</Link>
        <br />
        <Link href="/dashboard/arena" className="inline-block mt-4 text-[#f0a500] hover:underline">Back to Arena</Link>
      </div>
    );
  }

  const balanceDollars = balanceCents != null ? (balanceCents / 100).toFixed(2) : "—";

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between p-6 pb-2">
        <h1 className="text-2xl font-bold text-white">Training Gym</h1>
        <div className="flex items-center gap-4">
          <span className="text-[#9ca3af]">Wallet: <span className="text-white font-medium">${balanceDollars}</span></span>
          <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
        </div>
      </div>
      <div className="min-h-[280px] px-4 relative">
        {getHasWebGL() && (
          <div className="absolute inset-0 min-h-[280px] rounded-xl overflow-hidden">
            <BoxingRing3D mode="profile" />
          </div>
        )}
        <div className={`relative z-10 flex items-center justify-center min-h-[280px] ${getHasWebGL() ? "pointer-events-none" : ""}`}>
          <div className="rounded-xl border border-white/10 bg-[#0d1117]/85 px-6 py-4 backdrop-blur-[2px]">
            <FighterLayers
              fighter={fighter as FighterData}
              size="large"
              animation={trainingSessionKey ? "training" : "idle"}
              showGear
            />
          </div>
        </div>
      </div>
      <div className="p-6 pt-2">
      <p className="text-[#9ca3af] text-sm mb-6">
        Stats cap at {STAT_CAP}. Sessions 5 & 6 unlock after 2 and 3 completed sessions. Real wallet deduction from your GarmonPay balance.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-sm">
          {error}
        </div>
      )}
      {result && (
        <div className="mb-4 p-4 rounded-lg bg-[#0d1117] border border-white/10">
          <p className="text-white font-medium">
            +{result.gain} {result.stat} → now {result.newValue}. Total sessions: {result.trainingSessions}.
          </p>
          {result.balanceCents != null && (
            <p className="text-[#9ca3af] text-sm mt-1">New balance: ${(result.balanceCents / 100).toFixed(2)}</p>
          )}
        </div>
      )}
      {unlockToast.length > 0 && (
        <div className="mb-4 p-4 rounded-lg bg-[#f0a500]/20 border border-[#f0a500]/50">
          <p className="text-[#f0a500] font-bold">Signature move unlocked!</p>
          <ul className="list-disc list-inside mt-1 text-white">
            {unlockToast.map((k) => (
              <li key={k}>{SIGNATURE_MOVE_NAMES[k] ?? k}</li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 text-sm text-[#f0a500] hover:underline"
            onClick={() => setUnlockToast([])}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TRAINING_SESSIONS.map((s) => {
          const unlocked = isSessionUnlocked(s.requiredSessions, fighter.training_sessions);
          const currentStat = fighter[s.stat];
          const atCap = currentStat >= STAT_CAP;
          const canAfford = balanceCents != null && balanceCents >= s.priceCents;
          const disabled = !unlocked || atCap || !canAfford || trainingSessionKey !== null;
          const priceDollars = (s.priceCents / 100).toFixed(0);
          return (
            <div
              key={s.key}
              className={`rounded-lg border p-4 ${
                unlocked ? "bg-[#0d1117] border-white/10" : "bg-[#0d1117]/60 border-white/5"
              }`}
            >
              <h3 className="font-semibold text-white">{s.name}</h3>
              <p className="text-sm text-[#9ca3af] mt-1">
                +{s.minGain}–{s.maxGain} {s.stat} · ${priceDollars}
              </p>
              <p className="text-xs text-[#6b7280] mt-1">
                Current {s.stat}: {currentStat}/{STAT_CAP}
              </p>
              {!unlocked && (
                <p className="text-xs text-amber-400 mt-1">Unlocks after {s.requiredSessions} sessions</p>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => runTraining(s.key)}
                className="mt-3 w-full py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-[#3b82f6] text-white hover:bg-[#2563eb]"
              >
                {trainingSessionKey === s.key ? "Training…" : atCap ? "Maxed" : !canAfford ? "Insufficient balance" : "Train"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-white/10">
        <Link href="/dashboard/arena/fighter" className="text-[#f0a500] hover:underline">View my fighter stats</Link>
      </div>
      </div>
    </div>
  );
}
