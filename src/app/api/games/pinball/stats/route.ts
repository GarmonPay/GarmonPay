import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getUserPinballStats } from "@/lib/pinball-db";

/** GET /api/games/pinball/stats — current user's pinball stats. */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const stats = await getUserPinballStats(userId);
    return NextResponse.json(stats);
  } catch (e) {
    console.error("Pinball stats error:", e);
    return NextResponse.json({ bestScore: 0, rank: null, gamesPlayed: 0 });
  }
}
