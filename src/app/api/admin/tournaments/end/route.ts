import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { endTournament, getTournament } from "@/lib/tournament-db";
import { getTournamentTeamLeaderboard, distributeTeamPrize } from "@/lib/team-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/admin/tournaments/end — end tournament; distribute prizes (50/30/20). Body: tournamentId, distributeAs?: "individual" | "team". */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  let body: { tournamentId?: string; distributeAs?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const tournamentId = body.tournamentId?.trim();
  if (!tournamentId) return NextResponse.json({ message: "tournamentId required" }, { status: 400 });
  const distributeAs = body.distributeAs === "team" ? "team" : "individual";

  if (distributeAs === "team") {
    const tournament = await getTournament(tournamentId);
    if (!tournament) return NextResponse.json({ message: "Tournament not found" }, { status: 404 });
    if (tournament.status === "ended") return NextResponse.json({ message: "Already ended" }, { status: 400 });
    const teamLeaderboard = await getTournamentTeamLeaderboard(tournamentId);
    const prizePoolCents = Math.round(Number(tournament.prize_pool) * 100);
    const shares = [0.5, 0.3, 0.2];
    for (let i = 0; i < Math.min(3, teamLeaderboard.length); i++) {
      const amountCents = Math.floor(prizePoolCents * shares[i]);
      if (amountCents <= 0) continue;
      await distributeTeamPrize(teamLeaderboard[i].team_id, tournamentId, amountCents, "by_contribution");
    }
    const sb = createAdminClient();
    if (sb) {
      await sb.from("tournaments").update({ status: "ended", prize_pool: 0, updated_at: new Date().toISOString() }).eq("id", tournamentId);
    }
    return NextResponse.json({ success: true, mode: "team" });
  }

  const result = await endTournament(tournamentId);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Failed to end" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
