import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  getPinballGame,
  completePinballGame,
  upsertPinballLeaderboard,
  coinsForFreePlayScore,
  validateFreePlayScore,
  getPinballLeaderboardNew,
  getLeaderboardEntry,
} from "@/lib/pinball-games";

const SESSION_MAX_AGE_MS = 15 * 60 * 1000;

/** POST /api/pinball/game/end — End a game and submit score. Body: { session_id, score, duration_seconds, balls_used, hits?, garmon_completions?, jackpot_hit? }. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    session_id?: string;
    score?: number;
    duration_seconds?: number;
    balls_used?: number;
    hits?: { bumper: string; t: number }[];
    garmon_completions?: number;
    jackpot_hit?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : null;
  const score = typeof body.score === "number" ? Math.max(0, Math.floor(body.score)) : 0;
  const durationSeconds = typeof body.duration_seconds === "number" ? Math.max(0, Math.floor(body.duration_seconds)) : 0;
  const ballsUsed = typeof body.balls_used === "number" ? Math.max(0, Math.floor(body.balls_used)) : 0;
  const hits = Array.isArray(body.hits) ? body.hits : undefined;

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const game = await getPinballGame(sessionId, userId);
  if (!game) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 400 });
  }
  if (game.completed_at) {
    return NextResponse.json({ error: "Game already completed" }, { status: 400 });
  }

  const created = new Date(game.created_at).getTime();
  if (Date.now() - created > SESSION_MAX_AGE_MS) {
    return NextResponse.json({ error: "Session expired" }, { status: 400 });
  }

  if (game.mode === "free") {
    const validation = validateFreePlayScore(score, durationSeconds, hits);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.reason ?? "Score rejected" }, { status: 400 });
    }
  }

  const coinsEarned = game.mode === "free" ? coinsForFreePlayScore(score) : 0;
  const cashEarnedCents = 0;

  try {
    await completePinballGame(sessionId, userId, {
      score,
      balls_used: ballsUsed,
      duration_seconds: durationSeconds,
      garmon_completions: body.garmon_completions ?? 0,
      jackpot_hit: body.jackpot_hit ?? false,
      coins_earned: coinsEarned,
      cash_earned_cents: cashEarnedCents,
      hit_log: hits ?? null,
    });

    await upsertPinballLeaderboard(userId, null, score, false, false, cashEarnedCents);

    const leaderboard = await getPinballLeaderboardNew(10);
    const myEntry = await getLeaderboardEntry(userId);
    const rankIdx = leaderboard.findIndex((e) => e.user_id === userId);
    const rank = rankIdx >= 0 ? rankIdx + 1 : null;

    return NextResponse.json({
      ok: true,
      score,
      coins_earned: coinsEarned,
      cash_earned_cents: cashEarnedCents,
      rank,
      leaderboard,
      personal_best: myEntry?.highest_score ?? score,
      level: myEntry?.level ?? 1,
      level_name: myEntry?.level_name ?? "ROOKIE",
    });
  } catch (e) {
    console.error("Pinball game end error:", e);
    return NextResponse.json({ error: "Failed to save result" }, { status: 500 });
  }
}
