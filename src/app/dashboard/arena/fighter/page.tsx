"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getApiRoot } from "@/lib/api";
import { BoxingRing } from "@/components/arena/BoxingRing";
import type { FighterData } from "@/lib/arena-fighter-types";

export default function MyFighterPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fighter, setFighter] = useState<FighterData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) return;
      setSession(s);
      const token = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      fetch(`${getApiRoot()}/arena/me`, {
        headers: isToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token },
        credentials: "include",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data?.fighter && setFighter(data.fighter))
        .finally(() => setLoading(false));
    });
  }, []);

  if (loading || !session) {
    return <div className="p-6 text-[#9ca3af]">Loading…</div>;
  }
  if (!fighter) {
    return (
      <div className="p-6">
        <p className="text-[#9ca3af] mb-4">You don’t have a fighter yet.</p>
        <Link href="/dashboard/arena/create" className="text-[#f0a500] hover:underline">Create fighter</Link>
      </div>
    );
  }

  const totalStats = (fighter.strength ?? 0) + (fighter.speed ?? 0) + (fighter.stamina ?? 0) + (fighter.defense ?? 0) + (fighter.chin ?? 0) + (fighter.special ?? 0);
  const wins = fighter.wins ?? 0;
  const losses = fighter.losses ?? 0;
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : "—";

  const fighterData: FighterData = {
    ...fighter,
    name: fighter.name,
    style: fighter.style,
    avatar: fighter.avatar,
    strength: fighter.strength,
    speed: fighter.speed,
    stamina: fighter.stamina,
    defense: fighter.defense,
    chin: fighter.chin,
    special: fighter.special,
    wins: fighter.wins,
    losses: fighter.losses,
    body_type: fighter.body_type,
    skin_tone: fighter.skin_tone,
    face_style: fighter.face_style,
    hair_style: fighter.hair_style,
    equipped_gloves: fighter.equipped_gloves,
    equipped_shoes: fighter.equipped_shoes,
    equipped_shorts: fighter.equipped_shorts,
    equipped_headgear: fighter.equipped_headgear,
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-[#161b22] border border-white/10 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-stretch gap-0">
          <div className="flex-1 min-h-[260px] md:min-h-[320px]">
            <BoxingRing mode="profile" fighterA={fighterData} animation="idle" />
          </div>
          <div className="flex-1 p-6 flex flex-col justify-center border-t md:border-t-0 md:border-l border-white/10">
            <span className="text-5xl">{fighter.avatar}</span>
            <h1 className="text-2xl font-bold text-white mt-2">{fighter.name}</h1>
            {fighter.title && <p className="text-[#f0a500]">{fighter.title}</p>}
            <p className="text-[#9ca3af]">{fighter.style}</p>
            <p className="text-white mt-1">Record: {wins}W – {losses}L ({winRate}% win rate) · Streak: {fighter.win_streak ?? 0}</p>
            <p className="text-sm text-[#9ca3af]">Condition: {fighter.condition ?? "—"} · Training sessions: {fighter.training_sessions ?? 0}</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {(["strength", "speed", "stamina", "defense", "chin", "special"] as const).map((stat) => (
                <div key={stat} className="bg-[#0d1117] rounded-lg p-3">
                  <p className="text-[#9ca3af] text-xs capitalize">{stat}</p>
                  <p className="text-lg font-bold text-white">{fighter[stat] ?? 0}</p>
                  <div className="h-1.5 mt-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3b82f6] rounded-full" style={{ width: `${Math.min(100, ((fighter[stat] ?? 0) / 99) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[#9ca3af] text-sm mt-2">Total stats: {totalStats} (weight class by total)</p>
            <div className="mt-4 flex gap-3">
              <Link href="/dashboard/arena/train" className="px-4 py-2 rounded-lg bg-[#3b82f6] text-white font-medium">Training Gym</Link>
              <Link href="/dashboard/arena" className="px-4 py-2 rounded-lg border border-white/20 text-white">Back to Arena</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
