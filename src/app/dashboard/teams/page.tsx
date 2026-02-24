"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import {
  getMyTeam,
  createTeamApi,
  leaveTeamApi,
  getTeamLeaderboardApi,
  getTeamMembersApi,
} from "@/lib/api";
import { getSiteUrl } from "@/lib/site-url";

type Team = { id: string; name: string; owner_user_id: string; total_score: number };
type LeaderboardEntry = { rank: number; team_id: string; team_name: string; members_count: number; total_score: number };
type Member = { id: string; user_id: string; role: string; email?: string };

export default function DashboardTeamsPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function load() {
    if (!session) return;
    const tokenOrId = session.tokenOrId;
    const isToken = session.isToken;
    getMyTeam(tokenOrId, isToken)
      .then((r) => {
        setTeam(r.team ?? null);
        if (r.team) {
          return getTeamMembersApi(tokenOrId, isToken, r.team.id).then((m) => {
            setMembers(m.members ?? []);
          });
        }
        setMembers([]);
      })
      .catch(() => setError("Failed to load team"))
      .finally(() => setLoading(false));
    getTeamLeaderboardApi()
      .then((r) => setLeaderboard(r.leaderboard ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/teams");
        return;
      }
      const tokenOrId = s.accessToken ?? s.userId;
      const isToken = !!s.accessToken;
      setSession({ tokenOrId, isToken });
      setLoading(true);
    });
  }, [router]);

  useEffect(() => {
    if (session) {
      setLoading(true);
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.tokenOrId]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || creating || !createName.trim()) return;
    setError(null);
    setSuccess(null);
    setCreating(true);
    createTeamApi(session.tokenOrId, session.isToken, createName.trim())
      .then((r) => {
        setTeam(r.team);
        setCreateName("");
        setSuccess("Team created.");
        load();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Create failed"))
      .finally(() => setCreating(false));
  };

  const handleLeave = () => {
    if (!session || leaving || !team) return;
    if (!confirm("Leave this team? (If you're the owner and the only member, the team will be deleted.)")) return;
    setError(null);
    setLeaving(true);
    leaveTeamApi(session.tokenOrId, session.isToken)
      .then(() => {
        setTeam(null);
        setMembers([]);
        setSuccess("Left team.");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Leave failed"))
      .finally(() => setLeaving(false));
  };

  if (loading && !team) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 flex items-center justify-center min-h-[280px]">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Teams</h1>
        <p className="text-sm text-fintech-muted mt-1">
          Create or join a team. Compete in tournaments together; team score is the sum of member scores. One team per user.
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/15 border border-red-500/40 p-4 flex items-center justify-between">
          <p className="text-red-200">{error}</p>
          <button type="button" onClick={() => setError(null)} className="text-red-300 hover:text-white text-sm underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-green-500/15 border border-green-500/40 p-4 flex items-center justify-between">
          <p className="text-green-200">{success}</p>
          <button type="button" onClick={() => setSuccess(null)} className="text-green-300 hover:text-white text-sm underline">Dismiss</button>
        </div>
      )}

      {!team ? (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Create or join a team</h2>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[200px]">
              <label className="block text-sm text-fintech-muted mb-1">Team name</label>
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="My Team"
                className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/20 text-white placeholder:text-white/40"
              />
            </div>
            <button type="submit" disabled={creating || !createName.trim()} className="px-5 py-2.5 rounded-lg bg-fintech-accent text-white font-semibold hover:opacity-90 disabled:opacity-50">
              {creating ? "Creating…" : "Create Team"}
            </button>
          </form>
          <p className="text-sm text-fintech-muted mt-4">
            Or use an invite link: <strong className="text-white">/dashboard/teams/join?team=TEAM_ID</strong>
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-fintech-accent/20 text-fintech-accent font-bold text-lg">
                {team.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h2 className="text-xl font-semibold text-white">{team.name}</h2>
                <p className="text-sm text-fintech-muted">Total score: <span className="text-fintech-highlight font-semibold">{Number(team.total_score)}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const url = `${getSiteUrl()}/dashboard/teams/join?team=${team.id}`;
                  navigator.clipboard.writeText(url).then(() => setSuccess("Invite link copied.")).catch(() => setError("Could not copy"));
                }}
                className="px-4 py-2 rounded-lg border border-white/30 text-fintech-muted hover:text-white hover:border-white/50 text-sm"
              >
                Copy invite link
              </button>
              <button
                type="button"
                onClick={handleLeave}
                disabled={leaving}
                className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm disabled:opacity-50"
              >
                {leaving ? "Leaving…" : "Leave team"}
              </button>
            </div>
          </div>
          <div className="p-6">
            <h3 className="text-sm font-semibold text-fintech-muted uppercase tracking-wider mb-3">Members</h3>
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-black/20">
                  <span className="text-white">{m.email ?? "—"}</span>
                  <span className="text-fintech-muted text-sm">{m.role === "owner" ? "Owner" : "Member"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-fintech-bg-card border border-white/10 overflow-hidden">
        <h3 className="p-4 border-b border-white/10 text-lg font-semibold text-white">Team leaderboard</h3>
        <div className="p-4 overflow-x-auto">
          {leaderboard.length === 0 ? (
            <p className="text-fintech-muted">No teams yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-fintech-muted border-b border-white/10">
                  <th className="pb-2 pr-4">Rank</th>
                  <th className="pb-2 pr-4">Team</th>
                  <th className="pb-2 pr-4">Members</th>
                  <th className="pb-2">Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((e) => (
                  <tr key={e.team_id} className={`border-b border-white/5 ${team && e.team_id === team.id ? "bg-fintech-accent/10" : ""}`}>
                    <td className="py-3 pr-4 font-medium text-fintech-highlight">#{e.rank}</td>
                    <td className="py-3 pr-4 text-white font-medium">{e.team_name}</td>
                    <td className="py-3 pr-4 text-fintech-muted">{e.members_count}</td>
                    <td className="py-3 text-fintech-highlight font-semibold">{e.total_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
