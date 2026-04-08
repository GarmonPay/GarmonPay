import { NextResponse } from "next/server";

/** Legacy `/api/games/leaderboard` — previously delegated to Stake & Escape; kept as empty payload for compatibility. */
export async function GET() {
  return NextResponse.json({ window: "", entries: [] });
}
