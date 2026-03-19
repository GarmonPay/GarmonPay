"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import { io, Socket } from "socket.io-client";

import { getApiRoot } from "@/lib/api";
const wsUrl = process.env.NEXT_PUBLIC_BOXING_wsUrl || "http://localhost:3001";

type TournamentBracket = { rounds?: Array<{ matches: Array<{ fightId?: string; fighterAId?: string; fighterBId?: string; winnerId?: string }> }> };

export default function ArenaTournamentBracketPage() {
  const params = useParams();
  const id = params.id as string;
  const [session, setSession] = useState<Awaited<ReturnType<typeof getSessionAsync>>>(null);
  const [tournament, setTournament] = useState<{ name: string; status: string; bracket: TournamentBracket } | null>(null);
  const [fightersById, setFightersById] = useState<Record<string, { name: string; avatar: string }>>({});
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);

  const fetchTournament = useCallback(async () => {
    const s = await getSessionAsync();
    if (!s || !id) return;
    setSession(s);
    const token = s.accessToken ?? s.userId;
    const headers: Record<string, string> = s.accessToken ? { Authorization: `Bearer ${token}` } : { "X-User-Id": token };
    const res = await fetch(`${getApiRoot()}/arena/tournaments/${id}`, { headers, credentials: "include" });
    const data = res.ok ? await res.json() : null;
    if (data?.tournament) setTournament(data.tournament);
    if (data?.fightersById) setFightersById(data.fightersById);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  useEffect(() => {
    if (!id || !session) return;
    const s = io(wsUrl, { transports: ["websocket"], autoConnect: true });
    s.on("connect", () => {
      s.emit("join_tournament_room", { tournamentId: id });
    });
    s.on("bracket_update", (payload: { bracket: unknown }) => {
      setTournament((prev) => (prev ? { ...prev, bracket: payload.bracket as TournamentBracket } : null));
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [id, session]);

  if (loading || !tournament) {
    return <div className="p-6 text-[#9ca3af]">Loading…</div>;
  }

  const rounds = tournament.bracket?.rounds ?? [];
  const names = (fighterId: string | undefined) => (fighterId ? (fightersById[fighterId]?.name ?? fighterId.slice(0, 8)) : "—");

  return (
    <div className="rounded-xl bg-[#161b22] border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
        <Link href="/dashboard/arena/tournaments" className="text-[#f0a500] hover:underline">All tournaments</Link>
      </div>
      <p className="text-[#9ca3af] text-sm mb-6">Status: {tournament.status}</p>
      <div className="flex flex-wrap gap-8 overflow-x-auto">
        {rounds.map((round, rIdx) => (
          <div key={rIdx} className="flex flex-col gap-4">
            <p className="text-[#9ca3af] font-medium">Round {rIdx + 1}</p>
            {round.matches.map((m, mIdx) => (
              <div key={mIdx} className="rounded-lg bg-[#0d1117] border border-white/10 p-3 min-w-[200px]">
                <p className="text-white text-sm">{names(m.fighterAId)} vs {names(m.fighterBId)}</p>
                {m.winnerId && <p className="text-[#86efac] text-xs mt-1">Winner: {names(m.winnerId)}</p>}
                {m.fightId && !m.winnerId && (
                  <Link href={`/dashboard/arena/spectate/${m.fightId}`} className="text-xs text-[#3b82f6] hover:underline mt-1 inline-block">Watch</Link>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
