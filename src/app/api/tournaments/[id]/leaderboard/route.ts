import { NextResponse } from "next/server";
import { getTournamentLeaderboard } from "@/lib/tournament-db";

/** GET /api/tournaments/[id]/leaderboard — ranked players by score. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ message: "Tournament id required" }, { status: 400 });
  try {
    const leaderboard = await getTournamentLeaderboard(id);
    return NextResponse.json({ leaderboard });
  } catch (e) {
    console.error("Leaderboard error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}
