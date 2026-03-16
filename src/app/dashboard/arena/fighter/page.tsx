"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

import { getApiRoot } from "@/lib/api";

export default function MyFighterPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fighter, setFighter] = useState<{
    id: string; name: string; style: string; avatar: string; title?: string;
    strength: number; speed: number; stamina: number; defense: number; chin: number; special: number;
    wins: number; losses: number; condition: string; win_streak: number; training_sessions: number;
  } | null>(null);
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

  const totalStats = fighter.strength + fighter.speed + fighter.stamina + fighter.defense + fighter.chin + fighter.special;
  const winRate = fighter.wins + fighter.losses > 0 ? ((fighter.wins / (fighter.wins + fighter.losses)) * 100).toFixed(0) : "—";

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-[#161b22] border border-white/10 p-6">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-5xl">{fighter.avatar}</span>
          <div>
            <h1 className="text-2xl font-bold text-white">{fighter.name}</h1>
            {fighter.title && <p className="text-[#f0a500]">{fighter.title}</p>}
            <p className="text-[#9ca3af]">{fighter.style}</p>
            <p className="text-white mt-1">Record: {fighter.wins}W – {fighter.losses}L ({winRate}% win rate) · Streak: {fighter.win_streak}</p>
            <p className="text-sm text-[#9ca3af]">Condition: {fighter.condition} · Training sessions: {fighter.training_sessions}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {(["strength", "speed", "stamina", "defense", "chin", "special"] as const).map((stat) => (
            <div key={stat} className="bg-[#0d1117] rounded-lg p-3">
              <p className="text-[#9ca3af] text-sm capitalize">{stat}</p>
              <p className="text-xl font-bold text-white">{fighter[stat]}</p>
              <div className="h-2 mt-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-[#3b82f6] rounded-full" style={{ width: `${Math.min(100, (fighter[stat] / 99) * 100)}%` }} />
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
