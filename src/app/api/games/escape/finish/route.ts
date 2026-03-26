import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  creditEscapePayout,
  getEscapeSettings,
  listStakeWinnersOrdered,
  logTimer,
  netPoolCents,
  payoutCentsForRank,
  rankForSession,
  sumStakePoolForWindow,
  type EscapePuzzleRow,
} from "@/lib/escape-room-db";

export async function POST(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  const action = typeof body.action === "string" ? body.action : "solve";
  const pinRaw = typeof body.pin === "string" ? body.pin.replace(/\D/g, "").slice(0, 8) : "";

  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const db = supabase;

  const settings = await getEscapeSettings();
  if (!settings) {
    return NextResponse.json({ error: "Game unavailable" }, { status: 503 });
  }

  const { data: session, error: sErr } = await db
    .from("escape_room_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sErr || !session || (session as { player_id: string }).player_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const s = session as Record<string, unknown>;
  if (s.result !== "active") {
    return NextResponse.json({
      already_finished: true,
      result: s.result,
      payout_cents: Number(s.payout_cents ?? 0),
      escape_time_seconds: s.escape_time_seconds,
    });
  }

  const startedAt = new Date(String(s.started_at)).getTime();
  const countdown = Number(s.countdown_seconds);
  const now = Date.now();
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const expired = elapsed > countdown;

  const puzzleId = s.puzzle_id as string | null;
  const { data: puzzleRow } = puzzleId
    ? await db.from("escape_room_puzzles").select("*").eq("id", puzzleId).maybeSingle()
    : { data: null };

  const puzzle = puzzleRow as EscapePuzzleRow | null;

  async function closeLose(result: "lose" | "timeout") {
    await db
      .from("escape_room_sessions")
      .update({
        result,
        ended_at: new Date().toISOString(),
        server_elapsed_seconds: elapsed,
        timer_valid: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    await logTimer(sessionId, "finish", { result, elapsed_seconds: elapsed });
    return NextResponse.json({ result, elapsed_seconds: elapsed });
  }

  if (action === "quit") {
    return closeLose(expired ? "timeout" : "lose");
  }

  if (action === "timeout" || expired) {
    return closeLose("timeout");
  }

  if (!puzzle) {
    return NextResponse.json({ error: "Puzzle missing" }, { status: 500 });
  }

  const correct = puzzle.correct_pin;
  if (pinRaw.length !== 4 || pinRaw !== correct) {
    const prev =
      typeof s.puzzle_progress === "object" && s.puzzle_progress ? (s.puzzle_progress as object) : {};
    await db
      .from("escape_room_sessions")
      .update({
        entered_pin: pinRaw || null,
        puzzle_progress: { ...prev, last_attempt_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    return NextResponse.json({ error: "incorrect_pin" }, { status: 400 });
  }

  const suspicious = elapsed < Number(settings.suspicious_min_escape_seconds);
  const suspiciousReason = suspicious
    ? `Escape time ${elapsed}s under threshold ${settings.suspicious_min_escape_seconds}s`
    : null;

  const mode = String(s.mode);
  const windowKey = String(s.prize_pool_window);
  let payoutCents = 0;
  let platformFeeCents = 0;
  let payoutStatus: "none" | "pending" | "paid" | "failed" = "none";

  await db
    .from("escape_room_sessions")
    .update({
      result: "win",
      escape_time_seconds: elapsed,
      server_elapsed_seconds: elapsed,
      ended_at: new Date().toISOString(),
      timer_valid: true,
      entered_pin: pinRaw,
      suspicious,
      suspicious_reason: suspiciousReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId);

  if (mode === "stake") {
    const gross = await sumStakePoolForWindow(windowKey);
    const feePct = Number(settings.platform_fee_percent);
    const net = netPoolCents(gross, feePct);
    platformFeeCents = Math.max(0, gross - net);

    const winners = await listStakeWinnersOrdered(windowKey);
    const rank = rankForSession(winners, sessionId);
    const totalWinners = winners.length;
    const s1 = Number(settings.top1_split_percent);
    const s2 = Number(settings.top2_split_percent);
    const s3 = Number(settings.top3_split_percent);
    payoutCents = payoutCentsForRank(rank, totalWinners, net, s1, s2, s3);

    await db
      .from("escape_room_sessions")
      .update({
        platform_fee_cents: platformFeeCents,
        projected_payout_cents: payoutCents,
        payout_cents: payoutCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (suspicious) {
      payoutStatus = "pending";
      await db.from("escape_room_flags").insert({
        session_id: sessionId,
        player_id: userId,
        reason: suspiciousReason ?? "suspicious time",
        flag_type: "suspicious_time",
        status: "pending",
      });
      if (payoutCents > 0) {
        await db.from("escape_room_payouts").insert({
          session_id: sessionId,
          player_id: userId,
          amount_cents: payoutCents,
          status: "pending",
        });
      }
      await db
        .from("escape_room_sessions")
        .update({ payout_status: "pending", updated_at: new Date().toISOString() })
        .eq("id", sessionId);
    } else if (payoutCents > 0) {
      const pay = await creditEscapePayout(userId, sessionId, payoutCents);
      if (pay.ok) {
        payoutStatus = "paid";
        await db
          .from("escape_room_sessions")
          .update({
            payout_status: "paid",
            payout_reference: `escape_win_${sessionId}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionId);
        await db.from("escape_room_payouts").insert({
          session_id: sessionId,
          player_id: userId,
          amount_cents: payoutCents,
          status: "paid",
          paid_at: new Date().toISOString(),
        });
      } else {
        payoutStatus = "failed";
        await db.from("escape_room_payouts").insert({
          session_id: sessionId,
          player_id: userId,
          amount_cents: payoutCents,
          status: "failed",
          error_message: pay.message ?? "ledger error",
        });
        await db
          .from("escape_room_sessions")
          .update({ payout_status: "failed", updated_at: new Date().toISOString() })
          .eq("id", sessionId);
      }
    }
  }

  if (suspicious && mode === "free") {
    await db.from("escape_room_flags").insert({
      session_id: sessionId,
      player_id: userId,
      reason: suspiciousReason ?? "suspicious time",
      flag_type: "suspicious_time",
      status: "pending",
    });
  }

  await logTimer(sessionId, "finish", {
    result: "win",
    elapsed_seconds: elapsed,
    payout_cents: payoutCents,
    suspicious,
  });

  return NextResponse.json({
    result: "win",
    elapsed_seconds: elapsed,
    payout_cents: payoutCents,
    payout_status: mode === "stake" ? payoutStatus : "none",
    suspicious,
  });
}
