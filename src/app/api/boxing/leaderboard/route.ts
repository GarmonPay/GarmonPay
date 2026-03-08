import { NextResponse } from "next/server";
import { getBoxingLeaderboard } from "@/lib/boxing-leaderboard";

/** GET /api/boxing/leaderboard — top fighters by wins, losses, knockouts, total earnings. Public. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));
  try {
    const leaderboard = await getBoxingLeaderboard(limit);
    return NextResponse.json({ leaderboard });
  } catch (e) {
    console.error("Boxing leaderboard error:", e);
    return NextResponse.json({ leaderboard: [] });
  }
}
