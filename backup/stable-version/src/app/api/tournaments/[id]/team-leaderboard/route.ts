import { NextResponse } from "next/server";
import { getTournamentTeamLeaderboard } from "@/lib/team-db";

/** GET /api/tournaments/[id]/team-leaderboard — teams ranked by sum of member scores in this tournament. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ message: "Tournament id required" }, { status: 400 });
  try {
    const leaderboard = await getTournamentTeamLeaderboard(id);
    return NextResponse.json({ leaderboard });
  } catch (e) {
    console.error("Tournament team leaderboard error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}
