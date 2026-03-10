import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { canSubmitScoreForSession, insertPinballScore, getPinballLeaderboardAllTime } from "@/lib/pinball-db";

/** POST /api/games/pinball/score — submit score for a session. Body: { session_id, score }. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { session_id?: string; score?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : null;
  const score = typeof body.score === "number" ? Math.max(0, Math.floor(body.score)) : null;
  if (!sessionId || score === null) {
    return NextResponse.json({ error: "session_id and score required" }, { status: 400 });
  }
  const canSubmit = await canSubmitScoreForSession(sessionId, userId);
  if (!canSubmit) {
    return NextResponse.json({ error: "Invalid or already used session" }, { status: 400 });
  }
  try {
    await insertPinballScore(userId, sessionId, score);
    const leaderboard = await getPinballLeaderboardAllTime(10);
    const myEntry = leaderboard.find((e) => e.user_id === userId);
    return NextResponse.json({
      ok: true,
      rank: myEntry?.rank ?? null,
      leaderboard,
    });
  } catch (e) {
    console.error("Pinball score error:", e);
    return NextResponse.json({ error: "Failed to save score" }, { status: 500 });
  }
}
