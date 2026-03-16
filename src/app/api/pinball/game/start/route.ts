import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createPinballGame } from "@/lib/pinball-games";

/** POST /api/pinball/game/start — Start a free-play game. Body: { mode: "free" }. Returns { session_id, game_id }. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { mode?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const mode = body.mode === "h2h" || body.mode === "tournament" ? body.mode : "free";
  if (mode !== "free") {
    return NextResponse.json(
      { error: "Only free play is supported via this endpoint. Use match/tournament endpoints for paid modes." },
      { status: 400 }
    );
  }
  try {
    const game = await createPinballGame(userId, "free");
    return NextResponse.json({
      session_id: game.id,
      game_id: game.id,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    console.error("Pinball game start error:", e);
    return NextResponse.json(
      { error: "Failed to start game", details: message },
      { status: 500 }
    );
  }
}
