"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { io, Socket } from "socket.io-client";
import { computeOdds } from "@/lib/arena-economy";

import { getApiRoot } from "@/lib/api";
import { ArenaErrorBoundary } from "@/components/arena/ArenaErrorBoundary";
import { getFighterModelUrl } from "@/lib/meshy-assets";
import { logArenaFighterPayload, mergeArenaFighterPayload } from "@/lib/arena-merge-fighter";

/** 3D ring + Meshy GLB fighters — never SSR (Three.js). */
const ArenaFight3DView = dynamic(
  () => import("@/components/arena/ArenaFight3DView").then((m) => m.ArenaFight3DView),
  { ssr: false }
);

const wsUrl = process.env.NEXT_PUBLIC_BOXING_wsUrl || "http://localhost:3001";

const PUNCH_ACTIONS = ["JAB", "RIGHT_HAND", "HOOK", "BODY_SHOT", "SPECIAL"];

function mapActionToAnimLabel(action: string): string {
  if (action === "BLOCK") return "block";
  if (PUNCH_ACTIONS.includes(action)) return "punch";
  return "idle";
}

type Fighter = {
  id?: string;
  name?: string | null;
  style?: string | null;
  avatar?: string | null;
  strength?: number;
  speed?: number;
  stamina?: number;
  defense?: number;
  chin?: number;
  special?: number;
  model_3d_url?: string | null;
  model_url?: string | null;
  glb_url?: string | null;
  meshy_glb_url?: string | null;
};

export default function SpectateFightPage() {
  const params = useParams();
  const fightId = params.fightId as string;
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fight, setFight] = useState<{
    id: string;
    bettingOpen: boolean;
    winnerId: string | null;
    winnerCpuFighterId?: string | null;
  } | null>(null);
  const [fighterA, setFighterA] = useState<Fighter | null>(null);
  const [fighterB, setFighterB] = useState<Fighter | null>(null);
  const [healthA, setHealthA] = useState(100);
  const [healthB, setHealthB] = useState(100);
  const [log, setLog] = useState<Array<{ actionA: string; actionB: string; damageAtoB: number; damageBtoA: number }>>([]);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [betOn, setBetOn] = useState<string | null>(null);
  const [betting, setBetting] = useState(false);
  const [betError, setBetError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ringAnimation, setRingAnimation] = useState<"idle" | "big_hit" | "ko" | "victory">("idle");
  const [lastExchange, setLastExchange] = useState<{ actionA: string; actionB: string } | null>(null);
  const [exchangeKey, setExchangeKey] = useState(0);
  const [lastHitSide, setLastHitSide] = useState<"left" | "right" | null>(null);

  const fetchFight = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s || !fightId) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    const res = await fetch(`${getApiRoot()}/arena/fights/${fightId}`, { headers, credentials: "include" });
    const data = res.ok ? await res.json().catch(() => null) : null;
    if (!data || !data.fight) {
      console.error("[Arena] Spectate: invalid fight response", data);
    } else if (!data.fighterA || !data.fighterB) {
      console.error("[Arena] Spectate: fight missing fighterA or fighterB", data);
      setFight(null);
      setFighterA(null);
      setFighterB(null);
    } else {
      setFight(data.fight);
      logArenaFighterPayload("spectate GET fighterA", data.fighterA);
      logArenaFighterPayload("spectate GET fighterB", data.fighterB);
      setFighterA(data.fighterA);
      setFighterB(data.fighterB);
      const w = (data.fight.winnerId ?? data.fight.winnerCpuFighterId ?? null) as string | null;
      setWinnerId(w);
    }
    setLoading(false);
  }, [fightId]);

  useEffect(() => {
    fetchFight();
  }, [fetchFight]);

  const isLive = fight && !fight.winnerId && !fight.winnerCpuFighterId;
  useEffect(() => {
    if (!fightId || !isLive) return;
    const s = io(wsUrl, { transports: ["websocket"], autoConnect: true });
    s.on("connect", () => {
      s.emit("watch_fight", { fightId }, (ack: { ok?: boolean; message?: string }) => {
        if (!ack?.ok) console.warn("Watch failed:", ack?.message);
      });
    });
    s.on("fight_state", (payload: { healthA: number; healthB: number; log: typeof log; fighterA: Fighter; fighterB: Fighter }) => {
      setHealthA(payload.healthA);
      setHealthB(payload.healthB);
      setLog(payload.log ?? []);
      if (payload.fighterA) {
        logArenaFighterPayload("socket fight_state fighterA", payload.fighterA);
        setFighterA((prev) => mergeArenaFighterPayload(prev as Record<string, unknown> | null, payload.fighterA as Record<string, unknown>) as Fighter | null);
      }
      if (payload.fighterB) {
        logArenaFighterPayload("socket fight_state fighterB", payload.fighterB);
        setFighterB((prev) => mergeArenaFighterPayload(prev as Record<string, unknown> | null, payload.fighterB as Record<string, unknown>) as Fighter | null);
      }
    });
    s.on("exchange_result", (payload: { healthA: number; healthB: number; actionA: string; actionB: string; damageAtoB: number; damageBtoA: number }) => {
      setHealthA(payload.healthA);
      setHealthB(payload.healthB);
      setLastExchange({ actionA: payload.actionA, actionB: payload.actionB });
      setExchangeKey((k) => k + 1);
      if (payload.damageAtoB > payload.damageBtoA) setLastHitSide("right");
      else if (payload.damageBtoA > payload.damageAtoB) setLastHitSide("left");
      else setLastHitSide(null);
      setRingAnimation("big_hit");
      setTimeout(() => setRingAnimation("idle"), 350);
      setLog((prev) => [...prev, { actionA: payload.actionA, actionB: payload.actionB, damageAtoB: payload.damageAtoB, damageBtoA: payload.damageBtoA }]);
    });
    s.on(
      "fight_over",
      (payload: {
        winnerId: string;
        winnerArenaFighterId?: string | null;
        winnerCpuFighterId?: string | null;
      }) => {
        const wid = payload.winnerId;
        setWinnerId(wid);
        setRingAnimation("ko");
        setTimeout(() => setRingAnimation("victory"), 800);
        setFight((f) =>
          f
            ? {
                ...f,
                winnerId: payload.winnerArenaFighterId ?? null,
                winnerCpuFighterId: payload.winnerCpuFighterId ?? null,
                bettingOpen: false,
              }
            : f
        );
        s.disconnect();
      }
    );
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [fightId, isLive]);

  const placeBet = async () => {
    if (!session || !betOn || !fight?.bettingOpen) return;
    const amount = parseFloat(betAmount);
    if (!(amount >= 1)) {
      setBetError("Minimum bet $1");
      return;
    }
    setBetError(null);
    setBetting(true);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }),
    };
    try {
      const res = await fetch(`${getApiRoot()}/arena/fights/${fightId}/spectator-bet`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ amount, betOn }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBetError(data.message || "Bet failed");
        return;
      }
      setBetAmount("");
      setBetOn(null);
    } catch {
      setBetError("Network error");
    } finally {
      setBetting(false);
    }
  };

  const totalA =
    (fighterA?.strength ?? 0) +
    (fighterA?.speed ?? 0) +
    (fighterA?.stamina ?? 0) +
    (fighterA?.defense ?? 0) +
    (fighterA?.chin ?? 0) +
    (fighterA?.special ?? 0);
  const totalB =
    (fighterB?.strength ?? 0) +
    (fighterB?.speed ?? 0) +
    (fighterB?.stamina ?? 0) +
    (fighterB?.defense ?? 0) +
    (fighterB?.chin ?? 0) +
    (fighterB?.special ?? 0);
  const oddsA = totalA + totalB > 0 ? computeOdds(totalA, totalB) : 1.85;
  const oddsB = totalA + totalB > 0 ? computeOdds(totalB, totalA) : 1.85;

  const ringMode =
    winnerId ? "victory" : ringAnimation === "ko" ? "ko" : fight?.bettingOpen && log.length === 0 ? "setup" : "fight";
  const winnerSide3D: "left" | "right" | null =
    winnerId != null && winnerId === fighterA?.id ? "left" : winnerId != null && winnerId === fighterB?.id ? "right" : null;
  const refereeState = winnerId ? "arm_raise" : "watching";

  const staminaA = Math.max(0, healthA - Math.min(45, log.length * 3));
  const staminaB = Math.max(0, healthB - Math.min(45, log.length * 3));

  const fighterAAnim = useMemo(() => {
    if (winnerId && fighterA && fighterB) {
      if (winnerId === fighterA?.id) return "victory";
      if (winnerId === fighterB?.id) return "knockout";
    }
    if (ringAnimation === "ko") return "knockout";
    if (ringAnimation === "big_hit" && lastExchange) {
      return mapActionToAnimLabel(lastExchange.actionA);
    }
    return "idle";
  }, [winnerId, fighterA, fighterB, ringAnimation, lastExchange]);

  const fighterBAnim = useMemo(() => {
    if (winnerId && fighterA && fighterB) {
      if (winnerId === fighterB?.id) return "victory";
      if (winnerId === fighterA?.id) return "knockout";
    }
    if (ringAnimation === "ko") return "knockout";
    if (ringAnimation === "big_hit" && lastExchange) {
      return mapActionToAnimLabel(lastExchange.actionB);
    }
    return "idle";
  }, [winnerId, fighterA, fighterB, ringAnimation, lastExchange]);

  if (loading || !fightId) {
    return <div className="p-6 text-[#9ca3af]">Loading…</div>;
  }
  if (!fight || !fighterA || !fighterB) {
    return (
      <div className="p-6">
        <p className="text-[#9ca3af]">Fight not found.</p>
        <Link href="/dashboard/arena/spectate" className="text-[#f0a500] hover:underline mt-2 inline-block">Back to lobby</Link>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex flex-col rounded-xl bg-[#161b22] border border-white/10 overflow-hidden">
      <div className="relative w-full" style={{ minHeight: 320 }}>
        <ArenaErrorBoundary>
        <ArenaFight3DView
          mode={ringMode}
          refereeState={refereeState}
          winnerSide={winnerSide3D}
          fighterAName={fighterA?.name ?? "A"}
          fighterBName={fighterB?.name ?? "B"}
          fighterAModelUrl={getFighterModelUrl(fighterA) ?? null}
          fighterBModelUrl={getFighterModelUrl(fighterB) ?? null}
          fighterAAnim={fighterAAnim}
          fighterBAnim={fighterBAnim}
          healthA={healthA}
          healthB={healthB}
          staminaA={staminaA}
          staminaB={staminaB}
          koIntensity={ringAnimation === "ko" ? 1 : 0}
          exchangeKey={exchangeKey}
          lastHitSide={lastHitSide}
        />
        </ArenaErrorBoundary>
      </div>
      <div className="p-4 border-t border-white/10 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[#9ca3af] text-sm">Health: {Math.max(0, healthA)}% vs {Math.max(0, healthB)}%</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-white">Spectating</h1>
          <Link href="/dashboard/arena/spectate" className="text-[#f0a500] hover:underline">Back to lobby</Link>
        </div>
        {winnerId && (
          <p className="text-lg font-bold text-white mb-3">
            Winner: {winnerId === fighterA?.id ? fighterA?.name ?? "A" : fighterB?.name ?? "B"}
          </p>
        )}
        {fight?.bettingOpen && !winnerId && (
          <div className="mb-4 p-4 rounded-lg bg-[#0d1117] border border-white/10">
            <p className="text-white font-medium mb-2">Place spectator bet (before first punch)</p>
            {betError && <p className="text-red-400 text-sm mb-2">{betError}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="number"
                min={1}
                step={1}
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="Amount ($)"
                className="rounded-lg bg-[#161b22] border border-white/20 px-3 py-2 text-white w-24"
              />
              <button
                type="button"
                onClick={() => fighterA?.id && setBetOn(fighterA.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${betOn === fighterA?.id ? "bg-[#3b82f6] text-white" : "bg-[#161b22] border border-white/20 text-white"}`}
              >
                {fighterA?.name ?? "A"} ({(oddsA).toFixed(2)}x)
              </button>
              <button
                type="button"
                onClick={() => fighterB?.id && setBetOn(fighterB.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium ${betOn === fighterB?.id ? "bg-[#3b82f6] text-white" : "bg-[#161b22] border border-white/20 text-white"}`}
              >
                {fighterB?.name ?? "B"} ({(oddsB).toFixed(2)}x)
              </button>
              <button
                type="button"
                disabled={betting || !betOn || !betAmount}
                onClick={placeBet}
                className="px-4 py-2 rounded-lg bg-[#f0a500] text-black font-medium hover:bg-[#e09500] disabled:opacity-50"
              >
                Place bet
              </button>
            </div>
            <p className="text-[#9ca3af] text-xs mt-2">Admin keeps 10% of spectator pot. Winners split 90%.</p>
          </div>
        )}
        {log.length > 0 && (
          <div className="max-h-32 overflow-y-auto rounded bg-[#0d1117] p-2 text-xs text-[#9ca3af]">
            {log.slice(-8).map((e, i) => (
              <div key={i}>
                {e.actionA} → {e.damageAtoB} dmg · {e.actionB} → {e.damageBtoA} dmg
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
