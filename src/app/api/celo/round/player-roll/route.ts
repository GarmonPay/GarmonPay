import { NextResponse } from "next/server";
import { evaluateRoll, resolvePlayerRoundOutcome, rollThreeDice } from "@/lib/celo-engine";
import { settlePointRound } from "@/lib/celo-settle-point-round";
import { getCeloUserId, admin } from "@/lib/celo-server";

const MAX_PLAYER_REROLLS = 24;

export async function POST(request: Request) {
  try {
    const userId = await getCeloUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const room_id = typeof body.room_id === "string" ? body.room_id : "";
    if (!room_id) {
      return NextResponse.json({ error: "room_id is required" }, { status: 400 });
    }

    const supabase = admin();

    const { data: round, error: roundErr } = await supabase
      .from("celo_rounds")
      .select(
        "id, room_id, status, banker_roll_result, banker_point, total_pot_cents, platform_fee_cents, round_number"
      )
      .eq("room_id", room_id)
      .eq("status", "player_rolling")
      .maybeSingle();

    if (roundErr || !round) {
      return NextResponse.json({ error: "No active player round for this room" }, { status: 400 });
    }

    if (round.banker_roll_result !== "point" || typeof round.banker_point !== "number") {
      return NextResponse.json({ error: "Round is not in a banker-point state" }, { status: 400 });
    }

    const { data: room } = await supabase
      .from("celo_rooms")
      .select("id, banker_id, platform_fee_pct")
      .eq("id", room_id)
      .maybeSingle();

    if (!room?.banker_id) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("celo_room_players")
      .select("bet_cents, role")
      .eq("room_id", room_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership || membership.role !== "player") {
      return NextResponse.json({ error: "Only seated players can roll" }, { status: 400 });
    }

    const betCents = Number(membership.bet_cents ?? 0);
    if (betCents <= 0) {
      return NextResponse.json({ error: "No active bet for this seat" }, { status: 400 });
    }

    const { data: existingRoll } = await supabase
      .from("celo_player_rolls")
      .select("id")
      .eq("round_id", round.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingRoll) {
      return NextResponse.json({ error: "You already rolled this round" }, { status: 400 });
    }

    let dice: [number, number, number] = rollThreeDice();
    let ev = evaluateRoll(dice);
    let attempts = 0;
    while (ev.result === "no_count" && attempts < MAX_PLAYER_REROLLS) {
      dice = rollThreeDice();
      ev = evaluateRoll(dice);
      attempts++;
    }

    if (ev.result === "no_count") {
      return NextResponse.json({ error: "Roll could not resolve — try again" }, { status: 500 });
    }

    const outcome = resolvePlayerRoundOutcome(ev, round.banker_roll_result, round.banker_point);

    const { error: insErr } = await supabase.from("celo_player_rolls").insert({
      round_id: round.id,
      room_id,
      user_id: userId,
      roll_number: 1,
      dice,
      roll_name: ev.rollName,
      roll_result: ev.result,
      point: ev.point ?? null,
      bet_cents: betCents,
      outcome,
      payout_cents: 0,
      platform_fee_cents: 0,
    });

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    const { data: allPlayers } = await supabase
      .from("celo_room_players")
      .select("user_id")
      .eq("room_id", room_id)
      .eq("role", "player")
      .gt("bet_cents", 0);

    const { data: allRolls } = await supabase
      .from("celo_player_rolls")
      .select("user_id")
      .eq("round_id", round.id);

    const playerIds = new Set((allPlayers ?? []).map((p) => (p as { user_id: string }).user_id));
    const rolledIds = new Set((allRolls ?? []).map((r) => (r as { user_id: string }).user_id));
    const allDone =
      playerIds.size > 0 &&
      Array.from(playerIds).every((id) => rolledIds.has(id));

    let roundCompleted = false;
    if (allDone) {
      const { data: outcomeRows } = await supabase
        .from("celo_player_rolls")
        .select("user_id, bet_cents, outcome")
        .eq("round_id", round.id);

      const winners =
        outcomeRows?.filter((r) => (r as { outcome: string }).outcome === "win") ?? [];
      const winnerClaims = winners.map((r) => ({
        userId: (r as { user_id: string }).user_id,
        betCents: Number((r as { bet_cents: number }).bet_cents),
      }));

      const settle = await settlePointRound(supabase, room_id, room.banker_id, {
        id: round.id,
        total_pot_cents: round.total_pot_cents,
        platform_fee_cents: round.platform_fee_cents,
        platform_fee_pct: room.platform_fee_pct,
      }, winnerClaims);

      if (!settle.ok) {
        await supabase.from("celo_audit_log").insert({
          room_id,
          round_id: round.id,
          user_id: userId,
          action: "point_settlement_failed",
          details: { message: settle.error },
        });
        return NextResponse.json({ error: settle.error ?? "Settlement failed" }, { status: 500 });
      }

      roundCompleted = true;
      await supabase.from("celo_audit_log").insert({
        room_id,
        round_id: round.id,
        user_id: userId,
        action: "point_round_completed",
        details: { winners: winnerClaims.length },
      });
    }

    return NextResponse.json({
      ok: true,
      roll: {
        dice,
        rollName: ev.rollName,
        result: ev.result,
        point: ev.point,
        outcome,
        rerolls: attempts,
      },
      round_completed: roundCompleted,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
