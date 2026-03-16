"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { io, Socket } from "socket.io-client";
import { computeOdds } from "@/lib/arena-economy";

import { getApiRoot } from "@/lib/api";
const WS_URL = process.env.NEXT_PUBLIC_ARENA_WS_URL || "http://localhost:3001";

type Fighter = {
  id: string;
  name: string;
  style: string;
  avatar: string;
  strength?: number;
  speed?: number;
  stamina?: number;
  defense?: number;
  chin?: number;
  special?: number;
};

export default function SpectateFightPage() {
  const params = useParams();
  const fightId = params.fightId as string;
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fight, setFight] = useState<{ id: string; bettingOpen: boolean; winnerId: string | null } | null>(null);
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

  const fetchFight = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s || !fightId) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    const res = await fetch(`${getApiRoot()}/arena/fights/${fightId}`, { headers, credentials: "include" });
    const data = res.ok ? await res.json() : null;
    if (data?.fight) {
      setFight(data.fight);
      setFighterA(data.fighterA);
      setFighterB(data.fighterB);
      setWinnerId(data.fight.winnerId ?? null);
    }
    setLoading(false);
  }, [fightId]);

  useEffect(() => {
    fetchFight();
  }, [fetchFight]);

  const isLive = fight && !fight.winnerId;
  useEffect(() => {
    if (!fightId || !isLive) return;
    const s = io(WS_URL, { transports: ["websocket"], autoConnect: true });
    s.on("connect", () => {
      s.emit("watch_fight", { fightId }, (ack: { ok?: boolean; message?: string }) => {
        if (!ack?.ok) console.warn("Watch failed:", ack?.message);
      });
    });
    s.on("fight_state", (payload: { healthA: number; healthB: number; log: typeof log; fighterA: Fighter; fighterB: Fighter }) => {
      setHealthA(payload.healthA);
      setHealthB(payload.healthB);
      setLog(payload.log ?? []);
      if (payload.fighterA) setFighterA(payload.fighterA);
      if (payload.fighterB) setFighterB(payload.fighterB);
    });
    s.on("exchange_result", (payload: { healthA: number; healthB: number; actionA: string; actionB: string; damageAtoB: number; damageBtoA: number }) => {
      setHealthA(payload.healthA);
      setHealthB(payload.healthB);
      setLog((prev) => [...prev, { actionA: payload.actionA, actionB: payload.actionB, damageAtoB: payload.damageAtoB, damageBtoA: payload.damageBtoA }]);
    });
    s.on("fight_over", (payload: { winnerId: string }) => {
      setWinnerId(payload.winnerId);
      setFight((f) => (f ? { ...f, winnerId: payload.winnerId, bettingOpen: false } : f));
      s.disconnect();
    });
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

  const totalA = (fighterA.strength ?? 0) + (fighterA.speed ?? 0) + (fighterA.stamina ?? 0) + (fighterA.defense ?? 0) + (fighterA.chin ?? 0) + (fighterA.special ?? 0);
  const totalB = (fighterB.strength ?? 0) + (fighterB.speed ?? 0) + (fighterB.stamina ?? 0) + (fighterB.defense ?? 0) + (fighterB.chin ?? 0) + (fighterB.special ?? 0);
  const oddsA = totalA + totalB > 0 ? computeOdds(totalA, totalB) : 1.85;
  const oddsB = totalA + totalB > 0 ? computeOdds(totalB, totalA) : 1.85;

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Spectating</h1>
        <Link href="/dashboard/arena/spectate" className="text-[#f0a500] hover:underline">Back to lobby</Link>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-[#0d1117] rounded-lg p-4 border border-white/10">
          <p className="text-[#9ca3af] text-sm">Fighter A</p>
          <p className="text-xl font-bold text-white">{fighterA.name}</p>
          <p className="text-[#f0a500]">{fighterA.style}</p>
          <div className="mt-2 h-3 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${healthA}%` }} />
          </div>
          <p className="text-white text-sm mt-1">{healthA} HP</p>
        </div>
        <div className="bg-[#0d1117] rounded-lg p-4 border border-white/10">
          <p className="text-[#9ca3af] text-sm">Fighter B</p>
          <p className="text-xl font-bold text-white">{fighterB.name}</p>
          <p className="text-[#f0a500]">{fighterB.style}</p>
          <div className="mt-2 h-3 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${healthB}%` }} />
          </div>
          <p className="text-white text-sm mt-1">{healthB} HP</p>
        </div>
      </div>
      {winnerId && (
        <p className="text-lg font-bold text-white mb-4">
          Winner: {winnerId === fighterA.id ? fighterA.name : fighterB.name}
        </p>
      )}
      {fight.bettingOpen && !winnerId && (
        <div className="mb-6 p-4 rounded-lg bg-[#0d1117] border border-white/10">
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
              onClick={() => setBetOn(fighterA.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${betOn === fighterA.id ? "bg-[#3b82f6] text-white" : "bg-[#161b22] border border-white/20 text-white"}`}
            >
              {fighterA.name} ({(oddsA).toFixed(2)}x)
            </button>
            <button
              type="button"
              onClick={() => setBetOn(fighterB.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${betOn === fighterB.id ? "bg-[#3b82f6] text-white" : "bg-[#161b22] border border-white/20 text-white"}`}
            >
              {fighterB.name} ({(oddsB).toFixed(2)}x)
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
        <div className="max-h-40 overflow-y-auto rounded bg-[#0d1117] p-2 text-xs text-[#9ca3af]">
          {log.slice(-12).map((e, i) => (
            <div key={i}>
              {e.actionA} → {e.damageAtoB} dmg · {e.actionB} → {e.damageBtoA} dmg
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
