"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

import { getApiRoot } from "@/lib/api";

const ProBoxer = dynamic(
  () => import("@/components/arena/ProBoxer"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: 380,
          background: "#000",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 48 }}>🥊</span>
      </div>
    ),
  }
);
import type { FighterData } from "@/lib/arena-fighter-types";
import { parseArenaMeResponse } from "@/lib/arena/arenaMeResponse";

type Def = { key: string; name: string; coins: number; unlocked: boolean };

export default function ArenaAchievementsPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [weightClass, setWeightClass] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<Def[]>([]);
  const [fighter, setFighter] = useState<FighterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const fetchAchievements = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    const [achRes, meRes] = await Promise.all([
      fetch(`${getApiRoot()}/arena/achievements`, { headers, credentials: "include" }),
      fetch(`${getApiRoot()}/arena/me`, { headers, credentials: "include" }),
    ]);
    const data = achRes.ok ? await achRes.json() : null;
    const meData = meRes.ok ? await meRes.json() : null;
    if (data) {
      setWeightClass(data.weightClass ?? null);
      setDefinitions(data.definitions ?? []);
    }
    const { fighter: f } = parseArenaMeResponse(meData ?? {});
    if (f) setFighter(f);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  const checkNow = async () => {
    if (!session) return;
    setChecking(true);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }) };
    await fetch(`${getApiRoot()}/arena/achievements/check`, { method: "POST", headers, credentials: "include", body: "{}" });
    fetchAchievements();
    setChecking(false);
  };

  if (loading || !session) {
    return <div className="p-6 text-[#9ca3af]">Loading…</div>;
  }

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Achievements</h1>
        <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
      </div>
      {fighter && (
        <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-[#0d1117] border border-white/10">
          <div className="w-[100px] h-[120px] shrink-0 rounded-lg overflow-hidden bg-black">
            <ProBoxer fighterColor={fighter.fighter_color || "#f0a500"} size="small" />
          </div>
          <div>
            {weightClass && <p className="text-[#9ca3af] text-sm">Weight class: <span className="text-white">{weightClass}</span> (matchmaking)</p>}
            <p className="text-white font-medium">{fighter?.name ?? "Fighter"}</p>
          </div>
        </div>
      )}
      {weightClass && !fighter && <p className="text-[#9ca3af] text-sm mb-4">Your weight class: <span className="text-white">{weightClass}</span> (matchmaking uses this)</p>}
      <p className="text-[#9ca3af] text-sm mb-4">Unlock achievements to earn arena coins. Conditions are checked when you claim below or after fights/training.</p>
      <button type="button" onClick={checkNow} disabled={checking} className="mb-4 px-3 py-1.5 rounded bg-white/10 text-white text-sm hover:bg-white/20 disabled:opacity-50">Check for new achievements</button>
      <ul className="space-y-2">
        {definitions.map((d) => (
          <li key={d.key} className="flex items-center justify-between rounded-lg bg-[#0d1117] border border-white/10 px-3 py-2">
            <span className={d.unlocked ? "text-[#86efac]" : "text-[#9ca3af]"}>{d.name}</span>
            <span className="text-[#f0a500]">+{d.coins} coins</span>
            {d.unlocked && <span className="text-xs text-[#6b7280]">Unlocked</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
