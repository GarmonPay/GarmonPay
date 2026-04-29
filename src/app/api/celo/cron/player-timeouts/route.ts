import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  resolvePlayerRollTimeout,
  type CeloPlayerRollTimeoutRoom,
  type CeloPlayerRollTimeoutRound,
} from "@/lib/celo-player-timeout";

export const runtime = "nodejs";

const BATCH_LIMIT = 25;

/** Requires CRON_SECRET; rejects if unset (do not run open cron). */
function authorizeCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const authHeader = request.headers.get("authorization");
  const secret = (
    request.headers.get("x-cron-secret") ??
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "")
  ).trim();
  return secret === expected;
}

export async function POST(request: Request) {
  return runPlayerRollTimeouts(request);
}

export async function GET(request: Request) {
  return runPlayerRollTimeouts(request);
}

async function runPlayerRollTimeouts(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const nowIso = new Date().toISOString();

  const { data: overdue, error: qErr } = await admin
    .from("celo_rounds")
    .select("id, room_id, player_roll_deadline_at")
    .eq("status", "player_rolling")
    .not("player_roll_deadline_at", "is", null)
    .lt("player_roll_deadline_at", nowIso)
    .or("roll_processing.is.null,roll_processing.eq.false")
    .limit(BATCH_LIMIT);

  if (qErr) {
    console.error("[C-Lo timeout cron]", { error: qErr.message });
    return NextResponse.json({ message: qErr.message ?? "Query failed" }, { status: 500 });
  }

  const processed: string[] = [];
  const skipped: Array<{ roundId: string; reason: string }> = [];

  for (const row of overdue ?? []) {
    const roundId = String((row as { id?: string }).id ?? "");
    const roomId = String((row as { room_id?: string }).room_id ?? "");
    if (!roundId || !roomId) {
      skipped.push({ roundId: roundId || "?", reason: "missing_ids" });
      continue;
    }

    const { data: roomRaw } = await admin
      .from("celo_rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();
    const { data: roundRaw } = await admin
      .from("celo_rounds")
      .select("*")
      .eq("id", roundId)
      .maybeSingle();

    if (!roomRaw || !roundRaw) {
      console.log("[C-Lo timeout cron]", { roundId, roomId, outcome: "skip_missing_room_or_round" });
      skipped.push({ roundId, reason: "missing_room_or_round" });
      continue;
    }

    const room = roomRaw as CeloPlayerRollTimeoutRoom;
    const round = roundRaw as CeloPlayerRollTimeoutRound;
    const feePct = room.platform_fee_pct ?? 10;

    const result = await resolvePlayerRollTimeout(admin, { room, round, feePct });

    if (!result.ok) {
      console.log("[C-Lo timeout cron]", {
        roundId,
        roomId,
        outcome: "skip",
        error: result.error,
        status: result.status,
      });
      skipped.push({ roundId, reason: result.error });
      continue;
    }

    processed.push(roundId);
    console.log("[C-Lo timeout cron]", {
      roundId,
      roomId,
      outcome: "processed",
      roundComplete: Boolean(result.body.roundComplete),
    });
  }

  return NextResponse.json({
    ok: true,
    now: nowIso,
    examined: (overdue ?? []).length,
    processed,
    skipped,
  });
}
