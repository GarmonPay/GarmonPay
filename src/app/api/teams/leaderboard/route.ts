import { NextResponse } from "next/server";
import { getTeamLeaderboard } from "@/lib/team-db";

/** GET /api/teams/leaderboard — rank teams by total_score DESC. */
export async function GET() {
  try {
    const leaderboard = await getTeamLeaderboard(50);
    return NextResponse.json({ leaderboard });
  } catch (e) {
    console.error("Team leaderboard error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}
