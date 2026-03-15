import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { insertGameScore, getGameLeaderboard, type GameSlug } from "@/lib/game-station-db";

const VALID_SLUGS: GameSlug[] = ["runner", "snake", "shooter", "dodge", "tap", "memory", "reaction", "spin"];

/** POST /api/games/station/score — submit score for a game. Body: { game_slug, score }. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { game_slug?: string; score?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const slug = typeof body.game_slug === "string" && VALID_SLUGS.includes(body.game_slug as GameSlug) ? body.game_slug as GameSlug : null;
  const score = typeof body.score === "number" ? Math.max(0, Math.floor(body.score)) : null;
  if (!slug || score === null) {
    return NextResponse.json({ error: "game_slug and score required" }, { status: 400 });
  }
  try {
    await insertGameScore(slug, userId, score);
    const leaderboard = await getGameLeaderboard(slug, 10);
    const myEntry = leaderboard.find((e) => e.user_id === userId);
    return NextResponse.json({ ok: true, rank: myEntry?.rank ?? null, leaderboard });
  } catch (e) {
    console.error("Game station score error:", e);
    return NextResponse.json({ error: "Failed to save score" }, { status: 500 });
  }
}
