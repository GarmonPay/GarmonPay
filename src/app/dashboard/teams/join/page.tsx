"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSessionAsync } from "@/lib/session";
import { getTeamByIdApi, joinTeamApi, getMyTeam } from "@/lib/api";

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("team")?.trim() ?? "";
  const [session, setSession] = useState<{ tokenOrId: string; isToken: boolean } | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionAsync().then((s) => {
      if (!s) {
        router.replace("/login?next=/dashboard/teams/join?team=" + encodeURIComponent(teamId));
        return;
      }
      setSession({ tokenOrId: s.accessToken ?? s.userId, isToken: !!s.accessToken });
    });
  }, [router, teamId]);

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      setTeamName(null);
      return;
    }
    getTeamByIdApi(teamId)
      .then((r) => setTeamName(r.team?.name ?? null))
      .catch(() => setTeamName(null))
      .finally(() => setLoading(false));
  }, [teamId]);

  const handleJoin = () => {
    if (!session || !teamId || joining) return;
    setError(null);
    setJoining(true);
    getMyTeam(session.tokenOrId, session.isToken)
      .then((r) => {
        if (r.team) {
          setError("You are already in a team. Leave it first to join another.");
          setJoining(false);
          return;
        }
        return joinTeamApi(session.tokenOrId, session.isToken, teamId);
      })
      .then((r) => {
        if (r?.success) router.replace("/dashboard/teams");
        else setJoining(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Join failed");
        setJoining(false);
      });
  };

  if (!teamId) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 text-center">
        <p className="text-fintech-muted">Missing invite: use a link like /dashboard/teams/join?team=TEAM_ID</p>
        <Link href="/dashboard/teams" className="mt-4 inline-block text-fintech-accent hover:underline">Back to Teams</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 flex items-center justify-center min-h-[200px]">
        <p className="text-fintech-muted">Loading…</p>
      </div>
    );
  }

  if (!teamName) {
    return (
      <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 text-center">
        <p className="text-fintech-muted">Team not found.</p>
        <Link href="/dashboard/teams" className="mt-4 inline-block text-fintech-accent hover:underline">Back to Teams</Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 max-w-md mx-auto text-center">
      <h2 className="text-xl font-semibold text-white mb-2">Join team</h2>
      <p className="text-fintech-muted mb-6">You’re invited to join <strong className="text-white">{teamName}</strong>.</p>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <div className="flex gap-3 justify-center flex-wrap">
        <button
          type="button"
          onClick={handleJoin}
          disabled={joining}
          className="px-6 py-2.5 rounded-lg bg-fintech-accent text-white font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {joining ? "Joining…" : "Join team"}
        </button>
        <Link href="/dashboard/teams" className="px-6 py-2.5 rounded-lg border border-white/30 text-fintech-muted hover:text-white">Cancel</Link>
      </div>
    </div>
  );
}

export default function DashboardTeamsJoinPage() {
  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Invite link</h1>
        <p className="text-sm text-fintech-muted mt-1">Join a team using the invite link.</p>
      </div>
      <Suspense fallback={<div className="rounded-xl bg-fintech-bg-card border border-white/10 p-8 min-h-[200px]" />}>
        <JoinContent />
      </Suspense>
    </div>
  );
}
