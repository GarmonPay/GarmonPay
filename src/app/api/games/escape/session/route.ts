import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getEscapeSettings, toPublicPuzzle, type EscapePuzzleRow } from "@/lib/escape-room-db";

export async function GET(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: session, error } = await supabase
    .from("escape_room_sessions")
    .select(
      "id, player_id, mode, stake_cents, started_at, countdown_seconds, result, puzzle_id, puzzle_progress, payout_cents, escape_time_seconds, prize_pool_window"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !session || (session as { player_id: string }).player_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const s = session as {
    id: string;
    started_at: string;
    countdown_seconds: number;
    result: string;
    puzzle_id: string | null;
    puzzle_progress: Record<string, unknown>;
    payout_cents: number;
    escape_time_seconds: number | null;
    mode: string;
    stake_cents: number;
    prize_pool_window: string;
  };

  const started = new Date(s.started_at).getTime();
  const endsAtMs = started + s.countdown_seconds * 1000;
  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const remainingSeconds = Math.max(0, Math.floor((endsAtMs - now) / 1000));
  const serverExpired = now > endsAtMs;

  let puzzle = null;
  if (s.puzzle_id) {
    const { data: prow } = await supabase
      .from("escape_room_puzzles")
      .select("*")
      .eq("id", s.puzzle_id)
      .maybeSingle();
    if (prow) puzzle = toPublicPuzzle(prow as EscapePuzzleRow);
  }

  const settings = await getEscapeSettings();

  return NextResponse.json({
    session_id: s.id,
    result: s.result,
    mode: s.mode,
    stake_cents: s.stake_cents,
    started_at: s.started_at,
    ends_at: new Date(endsAtMs).toISOString(),
    elapsed_seconds: elapsedSeconds,
    remaining_seconds: remainingSeconds,
    server_expired: serverExpired,
    puzzle_progress: s.puzzle_progress ?? {},
    puzzle,
    payout_cents: Number(s.payout_cents ?? 0),
    escape_time_seconds: s.escape_time_seconds,
    prize_pool_window: s.prize_pool_window,
    suspicious_min_seconds: settings?.suspicious_min_escape_seconds ?? 45,
  });
}
