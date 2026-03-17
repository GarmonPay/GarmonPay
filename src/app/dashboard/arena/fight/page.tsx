"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { io, Socket } from "socket.io-client";

import { getApiRoot } from "@/lib/api";
import { getHasWebGL } from "@/lib/webgl-detect";
import { BoxingRing } from "@/components/arena/BoxingRing";
import type { RefereeState } from "@/components/arena/Referee3D";
import type { FighterData } from "@/lib/arena-fighter-types";
import type { RingAnimationState } from "@/components/arena/BoxingRing";

const BoxingRing3D = dynamic(
  () => import("@/components/arena/BoxingRing3D").then((m) => m.BoxingRing3D),
  { ssr: false }
);
import { FighterModelInRing } from "@/components/arena/FighterModelInRing";

const WS_URL = process.env.NEXT_PUBLIC_BOXING_WS_URL || "http://localhost:3001";

const ARENA_ACTIONS = [
  { key: "JAB", label: "JAB" },
  { key: "RIGHT_HAND", label: "RIGHT HAND" },
  { key: "HOOK", label: "HOOK" },
  { key: "BODY_SHOT", label: "BODY SHOT" },
  { key: "DODGE_LEFT", label: "DODGE LEFT" },
  { key: "DODGE_RIGHT", label: "DODGE RIGHT" },
  { key: "BLOCK", label: "BLOCK" },
  { key: "SPECIAL", label: "SPECIAL" },
] as const;

type OpponentFighter = {
  id: string;
  name: string;
  style: string;
  avatar: string;
  strength: number;
  speed: number;
  stamina: number;
  defense: number;
  chin: number;
  special: number;
  taunt?: string;
  weakness?: string;
  isAi?: boolean;
  model_3d_url?: string | null;
};

export default function FindFightPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [cpuFighters, setCpuFighters] = useState<OpponentFighter[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [creatingAi, setCreatingAi] = useState(false);
  const [fightId, setFightId] = useState<string | null>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [fighterA, setFighterA] = useState<OpponentFighter | null>(null);
  const [fighterB, setFighterB] = useState<OpponentFighter | null>(null);
  const [showPreFight, setShowPreFight] = useState(false);
  const [pendingAiFight, setPendingAiFight] = useState<{
    fightId: string;
    joinToken: string;
    fighterA: OpponentFighter;
    fighterB: OpponentFighter;
  } | null>(null);
  const [healthA, setHealthA] = useState(100);
  const [healthB, setHealthB] = useState(100);
  const [log, setLog] = useState<Array<{ actionA: string; actionB: string; damageAtoB: number; damageBtoA: number; hitA: boolean; hitB: boolean }>>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [hitOnMe, setHitOnMe] = useState(false);
  const [hitOnThem, setHitOnThem] = useState(false);
  const [loserKoActive, setLoserKoActive] = useState(false);
  const [opponentKoActive, setOpponentKoActive] = useState(false);
  const [ringAnimation, setRingAnimation] = useState<RingAnimationState>("idle");
  const [refereeState, setRefereeState] = useState<RefereeState>("watching");
  const [knockdownCount, setKnockdownCount] = useState(0);
  const countIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ring3dRef = useRef<{ shake: () => void } | null>(null);
  const useWebGL = getHasWebGL();

  const clearCountInterval = useCallback(() => {
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current);
      countIntervalRef.current = null;
    }
  }, []);

  const fetchCpu = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    const res = await fetch(`${getApiRoot()}/arena/cpu-fighters`, { headers, credentials: "include" });
    const data = res.ok ? await res.json() : null;
    if (data?.fighters) setCpuFighters(data.fighters);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCpu();
  }, [fetchCpu]);

  const startFight = async (cpuId?: string) => {
    if (!session) return;
    setError(null);
    if (cpuId) setCreating(cpuId);
    else setCreatingAi(true);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }),
    };
    const body = cpuId ? { cpuFighterId: cpuId } : { opponentType: "ai" };
    try {
      const res = await fetch(`${getApiRoot()}/arena/fights/create`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Failed to create fight");
        return;
      }
      if (data.fighterB?.isAi && (data.fighterB?.taunt != null || data.fighterB?.weakness != null)) {
        setPendingAiFight({
          fightId: data.fightId,
          joinToken: data.joinToken,
          fighterA: data.fighterA,
          fighterB: data.fighterB,
        });
        setShowPreFight(true);
      } else {
        setFightId(data.fightId);
        setJoinToken(data.joinToken);
        setFighterA(data.fighterA);
        setFighterB(data.fighterB);
        setHealthA(100);
        setHealthB(100);
        setLog([]);
        setWinnerId(null);
        setRefereeState("pre_fight");
        setKnockdownCount(0);
        clearCountInterval();
      }
    } catch (e) {
      setError("Network error");
    } finally {
      setCreating(null);
      setCreatingAi(false);
    }
  };

  useEffect(() => {
    if (!fightId || !joinToken) return;
    const s = io(WS_URL, { transports: ["websocket"], autoConnect: true });
    s.on("connect", () => {
      s.emit("join_fight", { fightId, joinToken }, (ack: { ok?: boolean; message?: string }) => {
        if (!ack?.ok) {
          setError(ack?.message || "Failed to join fight");
        }
      });
    });
    s.on("fight_start", (payload: { healthA: number; healthB: number }) => {
      setHealthA(payload.healthA);
      setHealthB(payload.healthB);
      setRefereeState("pre_fight");
      setKnockdownCount(0);
      clearCountInterval();
      setTimeout(() => setRefereeState("watching"), 3000);
    });
    s.on("exchange_result", (payload: { actionA: string; actionB: string; damageAtoB: number; damageBtoA: number; healthA: number; healthB: number; hitA: boolean; hitB: boolean }) => {
      setHealthA(payload.healthA);
      setHealthB(payload.healthB);
      setLog((prev) => {
        const next = [...prev, payload];
        const last = prev[prev.length - 1];
        const backToBackSpecial =
          (payload.actionA === "SPECIAL" || payload.actionB === "SPECIAL") &&
          last &&
          (last.actionA === "SPECIAL" || last.actionB === "SPECIAL");
        if (backToBackSpecial) {
          setRefereeState("warning");
          setTimeout(() => setRefereeState("watching"), 3000);
        }
        if (payload.healthA <= 0 || payload.healthB <= 0) {
          clearCountInterval();
          setRefereeState("knockdown");
          setKnockdownCount(0);
          let c = 0;
          countIntervalRef.current = setInterval(() => {
            c += 1;
            setKnockdownCount(c);
            if (c >= 10) clearCountInterval();
          }, 800);
        }
        return next;
      });
      if (payload.hitA || payload.hitB) {
        setRingAnimation("big_hit");
        ring3dRef.current?.shake();
        setTimeout(() => setRingAnimation("idle"), 350);
      }
      if (payload.hitA) {
        setHitOnMe(true);
        setTimeout(() => setHitOnMe(false), 350);
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(50);
      }
      if (payload.hitB) {
        setHitOnThem(true);
        setTimeout(() => setHitOnThem(false), 350);
      }
    });
    s.on("fight_over", (payload: { winnerId: string }) => {
      clearCountInterval();
      setRefereeState("stopped");
      setWinnerId(payload.winnerId);
      setRingAnimation("ko");
      setTimeout(() => setRingAnimation("victory"), 800);
      setTimeout(() => setRefereeState("arm_raise"), 1200);
      const myId = fighterA?.id;
      if (myId && payload.winnerId !== myId) {
        setLoserKoActive(true);
        setTimeout(() => setLoserKoActive(false), 1500);
      } else if (myId && payload.winnerId === myId) {
        setOpponentKoActive(true);
        setTimeout(() => setOpponentKoActive(false), 1500);
      }
      s.disconnect();
    });
    setSocket(s);
    return () => {
      clearCountInterval();
      s.disconnect();
      setSocket(null);
    };
  }, [fightId, joinToken, clearCountInterval, fighterA?.id]);

  const sendAction = (type: string) => {
    if (socket && winnerId == null) {
      socket.emit("action", { type });
      setLastAction(type);
      setTimeout(() => setLastAction(null), 450);
    }
  };

  if (loading || !session) {
    return (
      <div className="p-6 text-[#9ca3af]">Loading…</div>
    );
  }

  const inFight = (fightId && (fighterA || fighterB)) || (showPreFight && pendingAiFight);
  if (inFight) {
    const fa = fighterA ?? pendingAiFight?.fighterA ?? null;
    const fb = fighterB ?? pendingAiFight?.fighterB ?? null;
    const myFighterId = fa?.id;
    const iWon = winnerId != null && winnerId === myFighterId;
    const ringMode = showPreFight && !fightId ? "setup" : winnerId != null ? "victory" : "fight";
    const fighterAAnim =
      winnerId != null
        ? iWon
          ? "victory"
          : loserKoActive
            ? "ko"
            : "defeat"
        : hitOnMe
          ? "hit"
          : lastAction
            ? "fighting"
            : "idle";
    const fighterBAnim =
      winnerId != null
        ? iWon
          ? opponentKoActive
            ? "ko"
            : "defeat"
          : "victory"
        : hitOnThem
          ? "hit"
          : "idle";

    const animTo3D = (a: string) =>
      a === "victory" ? "victory" : a === "ko" || a === "defeat" ? "defeat" : a === "fighting" ? "punch-left" : "idle";

    const effectiveRefereeState: RefereeState =
      winnerId != null
        ? refereeState === "arm_raise"
          ? "arm_raise"
          : "stopped"
        : showPreFight && !fightId
          ? "pre_fight"
          : refereeState;
    const refereeWinnerSide =
      winnerId === fa?.id ? "left" : winnerId === fb?.id ? "right" : null;

    if (useWebGL) {
      return (
        <div className="min-h-[85vh] flex flex-col rounded-xl bg-[#161b22] border border-white/10 overflow-hidden">
          <div className="min-h-[60vh] min-h-[320px] w-full">
            <BoxingRing3D
              ref={ring3dRef}
              mode={ringMode}
              koIntensity={winnerId != null ? 1 : 0}
              refereeState={effectiveRefereeState}
              winnerSide={refereeWinnerSide}
              knockdownCount={knockdownCount}
              modelGenerating={!(fa as { model_3d_url?: string | null })?.model_3d_url || !(fb as { model_3d_url?: string | null })?.model_3d_url}
              fighterASlot={
                <FighterModelInRing
                  modelUrl={(fa as { model_3d_url?: string | null })?.model_3d_url}
                  color="#f0a500"
                  animation={animTo3D(fighterAAnim)}
                />
              }
              fighterBSlot={
                <FighterModelInRing
                  modelUrl={(fb as { model_3d_url?: string | null })?.model_3d_url}
                  color="#c1272d"
                  animation={animTo3D(fighterBAnim)}
                />
              }
            />
          </div>
          <div className="p-4 border-t border-white/10">
            {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
            {showPreFight && pendingAiFight && fb?.isAi && (
              <div className="mb-4 p-4 rounded-xl bg-[#0d1117] border border-[#f0a500]/30">
                <p className="text-[#9ca3af] text-sm mb-1">AI Opponent</p>
                <p className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🤖</span> {fb.name}
                </p>
                <p className="text-[#f0a500]">{fb.style}</p>
                {fb.taunt && <p className="mt-2 text-white italic">&ldquo;{fb.taunt}&rdquo;</p>}
                {fb.weakness && <p className="mt-1 text-[#9ca3af] text-sm">Weakness: {fb.weakness}</p>}
                <button
                  type="button"
                  onClick={() => {
                    if (!pendingAiFight) return;
                    setFightId(pendingAiFight.fightId);
                    setJoinToken(pendingAiFight.joinToken);
                    setFighterA(pendingAiFight.fighterA);
                    setFighterB(pendingAiFight.fighterB);
                    setHealthA(100);
                    setHealthB(100);
                    setLog([]);
                    setWinnerId(null);
                    setPendingAiFight(null);
                    setShowPreFight(false);
                    setRefereeState("pre_fight");
                    setKnockdownCount(0);
                    clearCountInterval();
                  }}
                  className="mt-4 px-4 py-2 rounded-lg bg-[#f0a500] text-black font-semibold hover:bg-[#e09500]"
                >
                  Start Fight
                </button>
              </div>
            )}
            {winnerId != null && (
              <div className="mb-4 p-4 rounded-lg bg-[#0d1117] border border-white/10">
                <p className="text-xl font-bold text-white">{iWon ? "You win!" : "You lost."}</p>
                <Link href="/dashboard/arena/fight" className="inline-block mt-2 text-[#f0a500] hover:underline" onClick={() => { setFightId(null); setJoinToken(null); setFighterA(null); setFighterB(null); setWinnerId(null); setPendingAiFight(null); setShowPreFight(false); setLoserKoActive(false); setOpponentKoActive(false); }}>Fight again</Link>
                <Link href="/dashboard/arena" className="inline-block mt-2 ml-4 text-[#f0a500] hover:underline">Back to Arena</Link>
              </div>
            )}
            {ringMode === "fight" && (
              <>
                <p className="text-[#9ca3af] text-sm mb-2">Tap an action (or wait 1.5s for auto-jab)</p>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {ARENA_ACTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => sendAction(key)}
                      className="py-3 px-2 rounded-lg bg-[#3b82f6] text-white text-sm font-medium hover:bg-[#2563eb]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {log.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto rounded bg-[#0d1117] p-2 text-xs text-[#9ca3af]">
                {log.slice(-6).map((e, i) => (
                  <div key={i}>
                    You: {e.actionA} → {e.damageAtoB} dmg {e.hitA && "✓"} · Opp: {e.actionB} → {e.damageBtoA} dmg {e.hitB && "✓"}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3">
              <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[85vh] flex flex-col rounded-xl bg-[#161b22] border border-white/10 overflow-hidden">
      <BoxingRing
        mode={ringMode}
        fighterA={(fa ?? { name: "You", body_type: "middleweight", skin_tone: "tone3", equipped_gloves: "default", equipped_shorts: "default", equipped_shoes: "default" }) as FighterData}
        fighterB={(fb ?? { name: "Opponent", body_type: "middleweight", skin_tone: "tone4", equipped_gloves: "default", equipped_shorts: "default", equipped_shoes: "default" }) as FighterData}
        winner={winnerId === fa?.id ? "a" : winnerId === fb?.id ? "b" : null}
        currentRound={1}
        animation={ringAnimation}
        fighterAAnimation={fighterAAnim}
        fighterBAnimation={fighterBAnim}
        healthA={healthA}
        healthB={healthB}
        lastAction={ringMode === "fight" ? lastAction : null}
      >
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        {showPreFight && pendingAiFight && fb?.isAi && (
          <div className="mb-4 p-4 rounded-xl bg-[#0d1117] border border-[#f0a500]/30">
            <p className="text-[#9ca3af] text-sm mb-1">AI Opponent</p>
            <p className="text-xl font-bold text-white flex items-center gap-2">
              <span>🤖</span> {fb.name}
            </p>
            <p className="text-[#f0a500]">{fb.style}</p>
            {fb.taunt && <p className="mt-2 text-white italic">&ldquo;{fb.taunt}&rdquo;</p>}
            {fb.weakness && <p className="mt-1 text-[#9ca3af] text-sm">Weakness: {fb.weakness}</p>}
            <button
              type="button"
              onClick={() => {
                if (!pendingAiFight) return;
                setFightId(pendingAiFight.fightId);
                setJoinToken(pendingAiFight.joinToken);
                setFighterA(pendingAiFight.fighterA);
                setFighterB(pendingAiFight.fighterB);
                setHealthA(100);
                setHealthB(100);
                setLog([]);
                setWinnerId(null);
                setPendingAiFight(null);
                setShowPreFight(false);
                setRefereeState("pre_fight");
                setKnockdownCount(0);
                clearCountInterval();
              }}
              className="mt-4 px-4 py-2 rounded-lg bg-[#f0a500] text-black font-semibold hover:bg-[#e09500]"
            >
              Start Fight
            </button>
          </div>
        )}
        {winnerId != null && (
          <div className="mb-4 p-4 rounded-lg bg-[#0d1117] border border-white/10">
            <p className="text-xl font-bold text-white">{iWon ? "You win!" : "You lost."}</p>
            <Link href="/dashboard/arena/fight" className="inline-block mt-2 text-[#f0a500] hover:underline" onClick={() => { setFightId(null); setJoinToken(null); setFighterA(null); setFighterB(null); setWinnerId(null); setPendingAiFight(null); setShowPreFight(false); setLoserKoActive(false); setOpponentKoActive(false); }}>Fight again</Link>
            <Link href="/dashboard/arena" className="inline-block mt-2 ml-4 text-[#f0a500] hover:underline">Back to Arena</Link>
          </div>
        )}
        {ringMode === "fight" && (
          <>
            <p className="text-[#9ca3af] text-sm mb-2">Tap an action (or wait 1.5s for auto-jab)</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {ARENA_ACTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => sendAction(key)}
                  className="py-3 px-2 rounded-lg bg-[#3b82f6] text-white text-sm font-medium hover:bg-[#2563eb]"
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
        {log.length > 0 && (
          <div className="mt-2 max-h-24 overflow-y-auto rounded bg-[#0d1117] p-2 text-xs text-[#9ca3af]">
            {log.slice(-6).map((e, i) => (
              <div key={i}>
                You: {e.actionA} → {e.damageAtoB} dmg {e.hitA && "✓"} · Opp: {e.actionB} → {e.damageBtoA} dmg {e.hitB && "✓"}
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
        </div>
      </BoxingRing>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 p-6">
      <h1 className="text-2xl font-bold text-white mb-2">Find Fight</h1>
      <p className="text-[#9ca3af] mb-4">Fight a CPU opponent or generate an AI opponent (Claude). Tap-to-punch during the fight; server resolves every exchange.</p>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      <div className="mb-4">
        <button
          type="button"
          disabled={creatingAi || creating !== null}
          onClick={() => startFight()}
          className="px-4 py-2 rounded-lg bg-[#8b5cf6] text-white font-medium hover:bg-[#7c3aed] disabled:opacity-50 flex items-center gap-2"
        >
          <span>🤖</span> Fight AI Opponent
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {cpuFighters.map((cpu) => (
          <div key={cpu.id} className="flex items-center justify-between rounded-lg bg-[#0d1117] border border-white/10 p-4">
            <div>
              <p className="font-semibold text-white">{cpu.name}</p>
              <p className="text-[#f0a500] text-sm">{cpu.style}</p>
              <p className="text-[#9ca3af] text-xs">STR {cpu.strength} SPD {cpu.speed} DEF {cpu.defense}</p>
            </div>
            <button
              type="button"
              disabled={creating !== null || creatingAi}
              onClick={() => startFight(cpu.id)}
              className="px-4 py-2 rounded-lg bg-[#f0a500] text-black font-medium hover:bg-[#e09500] disabled:opacity-50"
            >
              {creating === cpu.id ? "Starting…" : "Fight CPU"}
            </button>
          </div>
        ))}
      </div>
      {cpuFighters.length === 0 && !loading && <p className="text-[#9ca3af] mt-2">No CPU fighters. Run migrations to seed them.</p>}
      <Link href="/dashboard/arena" className="inline-block mt-4 text-[#f0a500] hover:underline">Back to Arena</Link>
    </div>
  );
}
