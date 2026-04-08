import { NextResponse } from "next/server";

/** GET `/api/games/leaderboard` — empty payload kept for API compatibility. */
export async function GET() {
  return NextResponse.json({ window: "", entries: [] });
}
