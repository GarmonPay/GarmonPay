"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";

import { getApiRoot } from "@/lib/api";
import { FighterDisplay } from "@/components/arena/FighterLayers";
import type { FighterData } from "@/lib/arena-fighter-types";

type Tournament = {
  id: string;
  name: string;
  tournament_type: string;
  entry_fee: number;
  entry_coin_fee: number;
  prize_pool: number;
  status: string;
  entryCount: number;
  max_fighters: number;
};

export default function ArenaTournamentsPage() {
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [fighter, setFighter] = useState<FighterData | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchTournaments = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    const [tournamentsRes, meRes] = await Promise.all([
      fetch(`${getApiRoot()}/arena/tournaments`, { headers, credentials: "include" }),
      fetch(`${getApiRoot()}/arena/me`, { headers, credentials: "include" }),
    ]);
    const data = tournamentsRes.ok ? await tournamentsRes.json() : null;
    if (data?.tournaments) setTournaments(data.tournaments);
    const meData = meRes.ok ? await meRes.json() : null;
    if (meData?.fighter) setFighter(meData.fighter);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  const join = async (id: string) => {
    if (!session) return;
    setError(null);
    setJoiningId(id);
    const token = session.accessToken ?? session.userId;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(session.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token }),
    };
    try {
      const res = await fetch(`${getApiRoot()}/arena/tournaments/${id}/join`, { method: "POST", headers, credentials: "include", body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Join failed");
        return;
      }
      fetchTournaments();
    } catch {
      setError("Network error");
    } finally {
      setJoiningId(null);
    }
  };

  if (loading || !session) {
    return <div className="p-6 text-[#9ca3af]">Loading…</div>;
  }

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Arena Tournaments</h1>
        <Link href="/dashboard/arena" className="text-[#f0a500] hover:underline">Back to Arena</Link>
      </div>
      {fighter && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-[#0d1117] border border-white/10">
          <FighterDisplay fighter={fighter} size="small" animation="idle" showGear />
          <div>
            <p className="text-white font-medium">{fighter.name}</p>
            <p className="text-[#9ca3af] text-sm">Enter with your fighter</p>
          </div>
        </div>
      )}
      <p className="text-[#9ca3af] text-sm mb-4">Daily free (coins), Weekly $5, Monthly $20, VIP $50. Admin keeps 15% of prize pool. When 8 players enter, bracket starts.</p>
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {tournaments.map((t) => (
          <div key={t.id} className="rounded-lg bg-[#0d1117] border border-white/10 p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-white">{t.name}</p>
              <p className="text-[#9ca3af] text-sm">
                {t.entry_coin_fee > 0 ? `${t.entry_coin_fee} coins` : `$${Number(t.entry_fee).toFixed(2)}`} · Prize pool: ${Number(t.prize_pool).toFixed(2)} · {t.entryCount}/{t.max_fighters}
              </p>
              <p className="text-xs text-[#6b7280] capitalize">{t.status}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`/dashboard/arena/tournaments/${t.id}`} className="px-3 py-1.5 rounded bg-white/10 text-white text-sm hover:bg-white/20">Bracket</Link>
              {t.status === "open" && (
                <button
                  type="button"
                  disabled={joiningId !== null}
                  onClick={() => join(t.id)}
                  className="px-3 py-1.5 rounded bg-[#f0a500] text-black text-sm font-medium hover:bg-[#e09500] disabled:opacity-50"
                >
                  {joiningId === t.id ? "…" : "Join"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {tournaments.length === 0 && <p className="text-[#9ca3af]">No open tournaments. Run migrations to seed.</p>}
    </div>
  );
}
