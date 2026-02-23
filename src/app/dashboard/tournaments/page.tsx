"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionAsync } from "@/lib/session";
import {
  getTournaments,
  joinTournamentApi,
  getTournamentLeaderboard,
  getTournamentJoined,
  getTournamentTeamLeaderboardApi,
} from "@/lib/api";

function formatMoney(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

function useCountdown(endDate: string | null) {
  const [remaining, setRemaining] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  useEffect(() => {
    if (!endDate) return;
    const tick = () => {
      const end = new Date(endDate).getTime();
      const now = Date.now();
      if (now >= end) {
        setRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      const d = Math.floor((end - now) / (24 * 60 * 60 * 1000));
      const h = Math.floor(((end - now) % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const m = Math.floor(((end - now) % (60 * 60 * 1000)) / (60 * 1000));
      const s = Math.floor(((end - now) % (60 * 1000)) / 1000);
      setRemaining({ days: d, hours: h, minutes: m, seconds: s });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endDate]);
  return remaining;
}

export default function DashboardTournamentsPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<Array<{ id: string; name: string; entry_fee: number; prize_pool: number; start_date: string; end_date: string; status: string }>>([]);
  const [joinedMap, setJoinedMap] = useState<Record<string, boolean>>({});
  const [leaderboards, setLeaderboards] = useState<Record<string, Array<{ rank: number; email: string; score: number; prizePosition: number | null }>>>({});
  const [teamLeaderboards, setTeamLeaderboards] = useState<Record<string, Array<{ rank: number; team_name: string; members_count: number; total_score: number }>>>({});
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/tournaments");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken });
      getTournaments(tokenOrId, isToken)
        .then((r) => {
          setTournaments(r.tournaments ?? []);
          return Promise.all(
            (r.tournaments ?? []).map((t) =>
              getTournamentJoined(tokenOrId, isToken, t.id).then((j) => ({ id: t.id, joined: j.joined }))
            )
          );
        })
        .then((pairs) => {
          const map: Record<string, boolean> = {};
          pairs.forEach(({ id, joined }) => { map[id] = joined; });
          setJoinedMap(map);
        })
        .catch(() => setError("Failed to load tournaments"))
        .finally(() => setLoading(false));
    });
  }, [router]);

  useEffect(() => {
    if (!session || tournaments.length === 0) return;
    tournaments.forEach((t) => {
      getTournamentLeaderboard(session.tokenOrId, session.isToken, t.id)
        .then((r) => setLeaderboards((prev) => ({ ...prev, [t.id]: r.leaderboard ?? [] })))
        .catch(() => {});
      getTournamentTeamLeaderboardApi(t.id)
        .then((r) => setTeamLeaderboards((prev) => ({ ...prev, [t.id]: r.leaderboard ?? [] })))
        .catch(() => {});
    });
  }, [session, tournaments]);

  const handleJoin = (tournamentId: string) => {
    if (!session || joiningId) return;
    setError(null);
    setJoiningId(tournamentId);
    joinTournamentApi(session.tokenOrId, session.isToken, tournamentId)
      .then(() => {
        setJoinedMap((prev) => ({ ...prev, [tournamentId]: true }));
        setTournaments((prev) => prev.map((t) => (t.id === tournamentId ? { ...t, prize_pool: t.prize_pool + (t.entry_fee || 0) } : t)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Join failed"))
      .finally(() => setJoiningId(null));
  };

  if (loading || !session) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 flex items-center justify-center min-h-[280px]">
        <p className="text-fintech-muted">Loading tournaments…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Tournaments</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Join with entry fee; prize pool is distributed to top 3 when the tournament ends (50% / 30% / 20%).
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-4 flex items-center justify-between">
          <p className="text-red-200">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-red-300 hover:text-white text-sm underline">Dismiss</button>
        </div>
      )}

      {tournaments.length === 0 ? (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 text-center">
          <p className="text-fintech-muted">No active or upcoming tournaments. Check back later.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {tournaments.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              joined={!!joinedMap[t.id]}
              leaderboard={leaderboards[t.id] ?? []}
              teamLeaderboard={teamLeaderboards[t.id] ?? []}
              onJoin={() => handleJoin(t.id)}
              joining={joiningId === t.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TournamentCard({
  tournament: t,
  joined,
  leaderboard,
  teamLeaderboard,
  onJoin,
  joining,
}: {
  tournament: { id: string; name: string; entry_fee: number; prize_pool: number; start_date: string; end_date: string; status: string };
  joined: boolean;
  leaderboard: Array<{ rank: number; email: string; score: number; prizePosition: number | null }>;
  teamLeaderboard: Array<{ rank: number; team_name: string; members_count: number; total_score: number }>;
  onJoin: () => void;
  joining: boolean;
}) {
  const countdown = useCountdown(t.end_date);
  const isActive = t.status === "active";
  const isUpcoming = t.status === "upcoming";

  return (
    <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden transition-all hover:border-fintech-accent/30">
      <div className="p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{t.name}</h2>
          <p className="text-sm text-fintech-muted mt-0.5">
            Entry: {formatMoney(t.entry_fee)} · Prize pool: <span className="text-fintech-money font-semibold">{formatMoney(t.prize_pool)}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          {countdown && (
            <div className="flex items-center gap-2 text-sm tabular-nums">
              <span className="text-fintech-muted">Time left:</span>
              <span className="text-white font-medium">
                {countdown.days}d {countdown.hours}h {countdown.minutes}m {countdown.seconds}s
              </span>
            </div>
          )}
          {!joined && (isActive || isUpcoming) && (
            <button
              type="button"
              onClick={onJoin}
              disabled={joining}
              className="px-5 py-2.5 rounded-lg bg-fintech-accent text-white font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join"}
            </button>
          )}
          {joined && <span className="px-4 py-2 rounded-lg bg-green-500/20 text-green-300 text-sm font-medium">Joined</span>}
        </div>
      </div>
      {leaderboard.length > 0 && (
        <div className={`p-6 ${teamLeaderboard.length > 0 ? "border-b border-white/10" : ""}`}>
          <h3 className="text-sm font-semibold text-fintech-muted uppercase tracking-wider mb-3">Leaderboard</h3>
          <ul className="space-y-2">
            {leaderboard.slice(0, 10).map((p) => (
              <li
                key={p.rank}
                className={`flex items-center justify-between py-2 px-3 rounded-lg ${p.prizePosition ? "bg-fintech-accent/10 border border-fintech-accent/30" : "bg-black/20"}`}
              >
                <span className="text-fintech-muted font-medium w-8">#{p.rank}</span>
                <span className="text-white truncate flex-1 mx-2">{p.email}</span>
                <span className="text-fintech-highlight font-semibold">{p.score}</span>
                {p.prizePosition && (
                  <span className="ml-2 text-fintech-money text-xs font-medium">
                    {p.prizePosition === 1 ? "1st" : p.prizePosition === 2 ? "2nd" : "3rd"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {teamLeaderboard.length > 0 && (
        <div className="p-6">
          <h3 className="text-sm font-semibold text-fintech-muted uppercase tracking-wider mb-3">Team standings</h3>
          <ul className="space-y-2">
            {teamLeaderboard.slice(0, 5).map((e) => (
              <li key={e.rank} className="flex items-center justify-between py-2 px-3 rounded-lg bg-black/20">
                <span className="text-fintech-muted font-medium w-8">#{e.rank}</span>
                <span className="text-white truncate flex-1 mx-2">{e.team_name}</span>
                <span className="text-fintech-muted text-xs">{e.members_count} members</span>
                <span className="text-fintech-highlight font-semibold ml-2">{e.total_score}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
