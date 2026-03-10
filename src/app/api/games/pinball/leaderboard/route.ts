import { NextResponse } from "next/server";
import { getPinballLeaderboardAllTime, getPinballLeaderboardWeekly } from "@/lib/pinball-db";

export const dynamic = "force-dynamic";

/** GET /api/games/pinball/leaderboard — top 10 all-time and weekly. */
export async function GET() {
  try {
    const [allTime, weekly] = await Promise.all([
      getPinballLeaderboardAllTime(10),
      getPinballLeaderboardWeekly(10),
    ]);
    return NextResponse.json({
      all_time: allTime,
      weekly,
    });
  } catch (e) {
    console.error("Pinball leaderboard error:", e);
    return NextResponse.json({ all_time: [], weekly: [] });
  }
}
