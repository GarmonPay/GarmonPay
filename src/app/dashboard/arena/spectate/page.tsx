"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

import { getApiRoot } from "@/lib/api";
import ProBoxer from "@/components/arena/ProBoxerClient";

type LiveFight = {
  id: string;
  fightType: string;
  bettingOpen: boolean;
  createdAt: string;
  fighterA: { id: string; name: string; style: string; avatar: string } | null;
  fighterB: { id: string; name: string; style: string; avatar: string } | null;
};

export default function SpectateLobbyPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fights, setFights] = useState<LiveFight[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLive = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    const res = await fetch(`${getApiRoot()}/arena/fights/live`, { headers, credentials: "include" });
    const data = res.ok ? await res.json() : null;
    if (data?.fights) setFights(data.fights);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLive();
  }, [fetchLive]);

  if (!session || loading) {
    return (
      <div className="p-6 text-[#9ca3af]">Loading live fights…</div>
    );
  }

  const firstFight = fights[0];
  const hasFighters = firstFight?.fighterA && firstFight?.fighterB;

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 overflow-hidden">
      <div className="flex items-center justify-between p-6 pb-2">
        <h1 className="text-2xl font-bold text-white">Live Fight Lobby</h1>
        <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
      </div>
      {fights.length > 0 && hasFighters && (
        <div className="min-h-[200px] px-4 mb-2 rounded-lg border border-white/10 overflow-hidden" style={{ background: "linear-gradient(180deg, #1a1008 0%, #0d1117 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "flex-end" }}>
            <div className="flex-1 min-w-0 max-w-[48%]">
              <ProBoxer facingRight={true} fighterColor="#f0a500" size="medium" />
            </div>
            <div className="flex-1 min-w-0 max-w-[48%]">
              <ProBoxer facingRight={false} fighterColor="#c1272d" size="medium" />
            </div>
          </div>
        </div>
      )}
      <div className="p-6 pt-0">
      <p className="text-[#9ca3af] text-sm mb-4">Watch any active fight. Place a bet before the first exchange (betting closes when the fight starts).</p>
      {fights.length === 0 ? (
        <p className="text-[#9ca3af]">No live fights right now. Start one from Find Fight.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {fights.map((f) => (
            <div key={f.id} className="rounded-lg bg-[#0d1117] border border-white/10 p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-[100px] shrink-0">
                  <ProBoxer facingRight={true} fighterColor="#f0a500" size="small" />
                </div>
                <span className="text-white font-medium">{f.fighterA?.name ?? "—"}</span>
                <span className="text-[#9ca3af]">vs</span>
                <span className="text-white font-medium">{f.fighterB?.name ?? "—"}</span>
                <div className="w-[100px] shrink-0">
                  <ProBoxer facingRight={false} fighterColor="#c1272d" size="small" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {f.bettingOpen && <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">Betting open</span>}
                <Link
                  href={`/dashboard/arena/spectate/${f.id}`}
                  className="px-3 py-1.5 rounded-lg bg-[#3b82f6] text-white text-sm font-medium hover:bg-[#2563eb]"
                >
                  Watch
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
