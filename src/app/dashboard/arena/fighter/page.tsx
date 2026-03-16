"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getApiRoot } from "@/lib/api";
import { BoxingRing } from "@/components/arena/BoxingRing";
import type { FighterData } from "@/lib/arena-fighter-types";

const REGEN_COST = 500;

export default function MyFighterPage() {
  const router = useRouter();
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fighter, setFighter] = useState<FighterData | null>(null);
  const [arenaCoins, setArenaCoins] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [regenModal, setRegenModal] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState("");

  const fetchMe = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const isToken = !!s.accessToken;
    const res = await fetch(`${getApiRoot()}/arena/me`, {
      headers: isToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token },
      credentials: "include",
    });
    const data = res.ok ? await res.json() : null;
    if (data?.fighter) setFighter(data.fighter);
    if (typeof data?.arenaCoins === "number") setArenaCoins(data.arenaCoins);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const handleRegenerate = async () => {
    if (!session || !fighter) return;
    setRegenError("");
    setRegenLoading(true);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    try {
      const res = await fetch(`${getApiRoot()}/arena/fighter/ai-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        credentials: "include",
        body: JSON.stringify({
          method: "auto",
          username: fighter.name || "Fighter",
          regeneration: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402) {
        setRegenError("You need 500 coins. Get more in the Store.");
        setRegenLoading(false);
        return;
      }
      if (!res.ok) {
        setRegenError(data.error || "Try again in a moment.");
        setRegenLoading(false);
        return;
      }
      setRegenModal(false);
      router.push("/dashboard/arena/create/reveal");
    } catch {
      setRegenError("Something went wrong.");
      setRegenLoading(false);
    }
  };

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
            {(fighter as { nickname?: string | null }).nickname && (
              <p className="text-lg font-medium mt-0.5" style={{ color: (fighter as { fighter_color?: string }).fighter_color || "#f0a500" }}>
                {(fighter as { nickname?: string }).nickname}
              </p>
            )}
            {fighter.title && <p className="text-[#f0a500]">{fighter.title}</p>}
            <p className="text-[#9ca3af]">{fighter.style}</p>
            {(fighter as { origin?: string | null }).origin && (
              <p className="text-sm text-[#9ca3af]">Fighting out of {(fighter as { origin?: string }).origin}</p>
            )}
            <p className="text-white mt-1">Record: {wins}W – {losses}L ({winRate}% win rate) · Streak: {fighter.win_streak ?? 0}</p>
            <p className="text-sm text-[#9ca3af]">Condition: {fighter.condition ?? "—"} · Training sessions: {fighter.training_sessions ?? 0}</p>
            {(fighter as { backstory?: string | null }).backstory && (
              <div className="mt-3 p-3 rounded-lg bg-[#0d1117] border border-white/10">
                <p className="text-[#9ca3af] text-xs uppercase mb-1">Backstory</p>
                <p className="text-white/90 text-sm italic">&ldquo;{(fighter as { backstory?: string }).backstory}&rdquo;</p>
              </div>
            )}
            {(fighter as { signature_move_name?: string | null }).signature_move_name && (
              <div className="mt-2 p-3 rounded-lg bg-[#0d1117] border border-white/10">
                <p className="text-[#f0a500] font-bold text-sm">{(fighter as { signature_move_name?: string }).signature_move_name}</p>
                {(fighter as { signature_move_desc?: string | null }).signature_move_desc && (
                  <p className="text-[#9ca3af] text-xs mt-1">{(fighter as { signature_move_desc?: string }).signature_move_desc}</p>
                )}
              </div>
            )}
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
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/dashboard/arena/train" className="px-4 py-2 rounded-lg bg-[#3b82f6] text-white font-medium">Training Gym</Link>
              <Link href="/dashboard/arena" className="px-4 py-2 rounded-lg border border-white/20 text-white">Back to Arena</Link>
              <button
                type="button"
                onClick={() => setRegenModal(true)}
                className="px-4 py-2 rounded-lg border border-white/20 text-[#9ca3af] hover:text-white hover:bg-white/5 text-sm"
              >
                Regenerate with AI (500 coins)
              </button>
            </div>
            {regenModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => !regenLoading && setRegenModal(false)}>
                <div className="rounded-xl bg-[#161b22] border border-white/10 p-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-white mb-2">Regenerate with AI?</h3>
                  <p className="text-[#9ca3af] text-sm mb-4">
                    This will replace your fighter&apos;s appearance, name, and backstory. Stats and record are kept. Costs 500 coins. You have {arenaCoins} coins.
                  </p>
                  {regenError && <p className="text-red-400 text-sm mb-2">{regenError}</p>}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={regenLoading || arenaCoins < REGEN_COST}
                      onClick={handleRegenerate}
                      className="flex-1 py-2 rounded-lg bg-[#f0a500] text-black font-medium disabled:opacity-50"
                    >
                      {regenLoading ? "Generating…" : "Continue"}
                    </button>
                    <button type="button" onClick={() => setRegenModal(false)} disabled={regenLoading} className="px-4 py-2 rounded-lg border border-white/20 text-white">
                      Cancel
                    </button>
                  </div>
                  {arenaCoins < REGEN_COST && <Link href="/dashboard/arena/store" className="block text-center text-[#f0a500] text-sm mt-2 hover:underline">Buy coins</Link>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
