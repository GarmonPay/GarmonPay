import { NextResponse } from "next/server";
import { getPinballLeaderboardAllTime, getPinballLeaderboardWeekly, getPinballLeaderboardDaily } from "@/lib/pinball-db";

export const dynamic = "force-dynamic";

/** GET /api/games/pinball/leaderboard — top 10 all-time, weekly, daily. */
export async function GET() {
  try {
    const [allTime, weekly, daily] = await Promise.all([
      getPinballLeaderboardAllTime(10),
      getPinballLeaderboardWeekly(10),
      getPinballLeaderboardDaily(10),
    ]);
    return NextResponse.json({
      all_time: allTime,
      weekly,
      daily,
    });
  } catch (e) {
    console.error("Pinball leaderboard error:", e);
    return NextResponse.json({ all_time: [], weekly: [], daily: [] });
  }
}
