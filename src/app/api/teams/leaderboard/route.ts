import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getTeamLeaderboard } from "@/lib/team-db";
import { getTeams } from "@/lib/teams";

/** GET /api/teams/leaderboard — rank teams by total_score DESC. */
export async function GET() {
  if (!createAdminClient()) {
    return NextResponse.json({ leaderboard: [] });
  }
  try {
    const leaderboard = await getTeamLeaderboard(50);
    return NextResponse.json({ leaderboard });
  } catch (e) {
    console.error("Team leaderboard error:", e);
    try {
      const teams = await getTeams();
      const withScore = (teams as { id: string; name: string; total_score?: number; owner_user_id?: string }[])
        .map((t, i) => ({
          rank: i + 1,
          team_id: t.id,
          team_name: t.name,
          members_count: 0,
          total_score: Number(t.total_score) ?? 0,
        }))
        .sort((a, b) => b.total_score - a.total_score)
        .slice(0, 50);
      return NextResponse.json({ leaderboard: withScore });
    } catch (fallbackErr) {
      return NextResponse.json({ leaderboard: [] });
    }
  }
}
