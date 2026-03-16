import { NextResponse } from "next/server";
import { getPinballLeaderboardNew } from "@/lib/pinball-games";

/** GET /api/pinball/leaderboard — Top 10 all-time free play leaderboard. */
export async function GET() {
  try {
    const leaderboard = await getPinballLeaderboardNew(10);
    return NextResponse.json({ leaderboard });
  } catch (e) {
    console.error("Pinball leaderboard error:", e);
    return NextResponse.json({ error: "Failed to load leaderboard" }, { status: 500 });
  }
}
