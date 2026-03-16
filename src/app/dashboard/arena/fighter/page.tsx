"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getApiRoot } from "@/lib/api";
import { FighterDisplay } from "@/components/arena/FighterDisplay";
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
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-6 mb-6">
          <div className="flex-shrink-0 flex justify-center md:justify-start">
            <FighterDisplay
              fighter={fighterData}
              size="large"
              animation="idle"
              showStats
              showGear
            />
          </div>
          <div className="flex-1 flex items-center gap-4 md:block">
            <span className="text-5xl">{fighter.avatar}</span>
            <div>
              <h1 className="text-2xl font-bold text-white">{fighter.name}</h1>
              {fighter.title && <p className="text-[#f0a500]">{fighter.title}</p>}
              <p className="text-[#9ca3af]">{fighter.style}</p>
<p className="text-white mt-1">Record: {wins}W – {losses}L ({winRate}% win rate) · Streak: {fighter.win_streak ?? 0}</p>
            <p className="text-sm text-[#9ca3af]">Condition: {fighter.condition ?? "—"} · Training sessions: {fighter.training_sessions ?? 0}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {(["strength", "speed", "stamina", "defense", "chin", "special"] as const).map((stat) => (
            <div key={stat} className="bg-[#0d1117] rounded-lg p-3">
              <p className="text-[#9ca3af] text-sm capitalize">{stat}</p>
              <p className="text-xl font-bold text-white">{fighter[stat] ?? 0}</p>
              <div className="h-2 mt-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#3b82f6] rounded-full" style={{ width: `${Math.min(100, ((fighter[stat] ?? 0) / 99) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[#9ca3af] text-sm mt-4">Total stats: {totalStats} (weight class assigned by total)</p>
        <div className="mt-6 flex gap-3">
          <Link href="/dashboard/arena/train" className="px-4 py-2 rounded-lg bg-[#3b82f6] text-white font-medium">Training Gym</Link>
          <Link href="/dashboard/arena" className="px-4 py-2 rounded-lg border border-white/20 text-white">Back to Arena</Link>
        </div>
      </div>
    </div>
  );
}
