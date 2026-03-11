import { NextResponse } from "next/server";
import {
  getGlobalLeaderboard,
  getGlobalLeaderboardWeekly,
} from "@/lib/game-station-db";

export const dynamic = "force-dynamic";

/** GET /api/games/station/leaderboard — global and weekly top 10. */
export async function GET() {
  try {
    const [global, weekly] = await Promise.all([
      getGlobalLeaderboard(10),
      getGlobalLeaderboardWeekly(10),
    ]);
    return NextResponse.json({ global, weekly });
  } catch (e) {
    console.error("Game station leaderboard error:", e);
    return NextResponse.json({ global: [], weekly: [] });
  }
}
