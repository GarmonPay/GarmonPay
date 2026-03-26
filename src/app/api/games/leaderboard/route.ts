import { NextResponse } from "next/server";
import { getEscapeLeaderboard } from "@/lib/escape-room-db";

/** GET /api/games/leaderboard - today's top Stake & Escape times. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 10)));
    const leaderboard = await getEscapeLeaderboard(limit);
    return NextResponse.json({ leaderboard });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load leaderboard";
    return NextResponse.json({ message }, { status: 500 });
  }
}
