import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { normalizeCeloRoomRow, mergeCeloRoomUpdate } from "@/lib/celo-room-schema";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { insertCeloPlatformFee } from "@/lib/celo-payout-ledger";
import { broadcastCeloRoomEvent } from "@/lib/celo-roll-broadcast";
import { getEligibleStakedPlayers } from "@/lib/celo-eligible-players";
import { finalizeCeloPlayerRollingRound } from "@/lib/celo-round-advance";
import { celoSameAuthUserId } from "@/lib/celo-room-rules";

type SupabaseClient = NonNullable<ReturnType<typeof createAdminClient>>;

/**
 * Short stop: void a no-count (reroll) roll, or forfeit when no_short_stop is declared.
 * POST body: { roundId, rollId, calledBy: 'player' | 'banker' }
 */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { roundId, rollId, calledBy } = body as {
    roundId?: string;
    rollId?: string;
    calledBy?: string;
  };

  if (!roundId || !rollId || !calledBy) {
    return NextResponse.json({ error: "roundId, rollId, and calledBy required" }, { status: 400 });
  }

  if (calledBy !== "player" && calledBy !== "banker") {
    return NextResponse.json({ error: "calledBy must be player or banker" }, { status: 400 });
  }

  const { data: roundRows, error: roundErr } = await supabase
    .from("celo_rounds")
    .select("*")
    .eq("id", roundId)
    .limit(1);

  const round = celoFirstRow(roundRows);
  if (roundErr || !round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const roundRow = round as Record<string, unknown>;
  const roomId = String(roundRow.room_id ?? "");
  const status = String(roundRow.status ?? "");
  const noShortStop = Boolean(roundRow.no_short_stop);
  const bankerShortUsed = Number(roundRow.banker_short_stops_used ?? 0);
  const bankerShortMax = Number(roundRow.banker_short_stops_max ?? 3);
  const coveredBy = (roundRow.covered_by as string | null) ?? null;

  if (status !== "player_rolling") {
    return NextResponse.json({ error: "Short stop only applies during player rolling" }, { status: 400 });
  }

  const { data: roomRows } = await supabase.from("celo_rooms").select("*").eq("id", roomId).limit(1);
  const roomRow = celoFirstRow(roomRows);
  if (!roomRow) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const rm = normalizeCeloRoomRow(roomRow as Record<string, unknown>);
  if (!rm) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const { data: rollRows, error: rollErr } = await supabase
    .from("celo_player_rolls")
    .select("*")
    .eq("id", rollId)
    .eq("round_id", roundId)
    .limit(1);

  const roll = celoFirstRow(rollRows);
  if (rollErr || !roll) {
    return NextResponse.json({ error: "Roll not found" }, { status: 404 });
  }

  const pr = roll as Record<string, unknown>;
  if (String(pr.room_id ?? "") !== roomId) {
    return NextResponse.json({ error: "Roll does not match room" }, { status: 400 });
  }

  if (Boolean(pr.voided_by_short_stop)) {
    return NextResponse.json({ error: "Roll already voided" }, { status: 400 });
  }

  const outcome = String(pr.outcome ?? "");
  const voidableOutcome = outcome === "reroll";

  const now = new Date().toISOString();

  if (calledBy === "player") {
    if (!celoSameAuthUserId(String(pr.user_id), userId)) {
      return NextResponse.json({ error: "You can only short stop your own roll" }, { status: 403 });
    }

    if (noShortStop) {
      if (outcome === "win" || outcome === "loss" || outcome === "lost_short_stop") {
        return NextResponse.json({ error: "Roll already resolved" }, { status: 400 });
      }

      return await handlePlayerForfeitShortStop(supabase, {
        roomId,
        roundId,
        rollId,
        userId,
        rm,
        coveredBy,
        now,
      });
    }

    if (!voidableOutcome) {
      return NextResponse.json(
        { error: "Short stop void only applies to a no-count (reroll) roll" },
        { status: 400 }
      );
    }

    const { error: vErr } = await supabase
      .from("celo_player_rolls")
      .update({
        voided_by_short_stop: true,
        short_stop_called_by: "player",
      })
      .eq("id", rollId);

    if (vErr) {
      return NextResponse.json({ error: vErr.message ?? "Failed to void roll" }, { status: 500 });
    }

    await broadcastCeloRoomEvent(supabase, roomId, "short_stop", {
      roomId,
      roundId,
      rollId,
      kind: "player_void",
      at: now,
      rollerUserId: String(pr.user_id ?? ""),
    });

    await supabase.from("celo_audit_log").insert({
      room_id: roomId,
      round_id: roundId,
      user_id: userId,
      action: "player_short_stop_void",
      details: { roll_id: rollId },
    });

    return NextResponse.json({ success: true, voided: true, reroll: true });
  }

  // Banker
  if (String(rm.banker_id) !== String(userId)) {
    return NextResponse.json({ error: "Only the banker can call banker short stop" }, { status: 403 });
  }

  if (bankerShortUsed >= bankerShortMax) {
    return NextResponse.json(
      { message: "Short stop limit reached (3 max per round)" },
      { status: 409 }
    );
  }

  if (!voidableOutcome) {
    return NextResponse.json(
      { error: "Banker short stop only applies to a no-count (reroll) roll" },
      { status: 400 }
    );
  }

  const newCount = bankerShortUsed + 1;

  const { error: vErr } = await supabase
    .from("celo_player_rolls")
    .update({
      voided_by_short_stop: true,
      short_stop_called_by: "banker",
    })
    .eq("id", rollId);

  if (vErr) {
    return NextResponse.json({ error: vErr.message ?? "Failed to void roll" }, { status: 500 });
  }

  const { error: rErr } = await supabase
    .from("celo_rounds")
    .update({ banker_short_stops_used: newCount })
    .eq("id", roundId);

  if (rErr) {
    return NextResponse.json({ error: rErr.message ?? "Failed to update round" }, { status: 500 });
  }

  await broadcastCeloRoomEvent(supabase, roomId, "short_stop", {
    roomId,
    roundId,
    rollId,
    kind: "banker_void",
    at: now,
    shortStopsRemaining: bankerShortMax - newCount,
    rollerUserId: String(pr.user_id ?? ""),
  });

  await supabase.from("celo_audit_log").insert({
    room_id: roomId,
    round_id: roundId,
    user_id: userId,
    action: "banker_short_stop",
    details: { roll_id: rollId, banker_short_stops_used: newCount },
  });

  return NextResponse.json({
    success: true,
    voided: true,
    reroll: true,
    shortStopsRemaining: bankerShortMax - newCount,
  });
}

async function handlePlayerForfeitShortStop(
  supabase: SupabaseClient,
  opts: {
    roomId: string;
    roundId: string;
    rollId: string;
    userId: string;
    rm: NonNullable<ReturnType<typeof normalizeCeloRoomRow>>;
    coveredBy: string | null;
    now: string;
  }
) {
  const { roomId, roundId, rollId, userId, rm, coveredBy, now } = opts;

  const eligibleBefore = await getEligibleStakedPlayers(supabase, roomId, coveredBy);
  const idx = eligibleBefore.findIndex((p) => celoSameAuthUserId(p.user_id, userId));
  const nextSeat = idx >= 0 ? eligibleBefore[idx + 1] : null;

  const { data: playerRows } = await supabase
    .from("celo_room_players")
    .select("user_id, bet_cents, entry_sc")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .limit(1);

  const playerRow = celoFirstRow(playerRows);
  if (!playerRow) {
    return NextResponse.json({ error: "Player not seated" }, { status: 400 });
  }

  const stake = celoPlayerStakeCents(playerRow as { bet_cents?: number; entry_sc?: number });
  if (stake <= 0) {
    return NextResponse.json({ error: "No stake to forfeit" }, { status: 400 });
  }

  const bankerId = String(rm.banker_id ?? "");
  if (!bankerId) {
    return NextResponse.json({ error: "Room has no banker" }, { status: 500 });
  }

  const feePct = rm.platform_fee_pct;
  const bankerFee = Math.floor((stake * feePct) / 100);
  const bankerNet = stake - bankerFee;

  const debitRef = `short_stop_forfeit_${rollId}_debit`;
  const creditRef = `short_stop_forfeit_${rollId}_credit`;

  const debit = await walletLedgerEntry(userId, "game_play", -stake, debitRef);
  if (!debit.success) {
    return NextResponse.json({ error: debit.message ?? "Debit failed" }, { status: 400 });
  }

  const credit = await walletLedgerEntry(bankerId, "game_win", bankerNet, creditRef);
  if (!credit.success) {
    await walletLedgerEntry(userId, "game_win", stake, `short_stop_forfeit_rollback_${rollId}`);
    return NextResponse.json({ error: credit.message ?? "Banker credit failed" }, { status: 500 });
  }

  await insertCeloPlatformFee(supabase, roundId, bankerFee, "short_stop_forfeit");

  await supabase
    .from("celo_rooms")
    .update(
      mergeCeloRoomUpdate(rm.current_bank_cents + bankerNet, {
        last_activity: now,
      })
    )
    .eq("id", roomId);

  await supabase
    .from("celo_room_players")
    .update({ entry_sc: 0, bet_cents: 0 })
    .eq("room_id", roomId)
    .eq("user_id", userId);

  await supabase
    .from("celo_player_rolls")
    .update({
      outcome: "lost_short_stop",
      voided_by_short_stop: false,
      short_stop_called_by: "player",
      payout_sc: 0,
      platform_fee_sc: bankerFee,
    })
    .eq("id", rollId);

  if (!nextSeat) {
    await finalizeCeloPlayerRollingRound(supabase, roomId, roundId, now);
  } else {
    await supabase
      .from("celo_rounds")
      .update({ current_player_seat: nextSeat.seat_number ?? 1 })
      .eq("id", roundId);
  }

  await broadcastCeloRoomEvent(supabase, roomId, "short_stop", {
    roomId,
    roundId,
    rollId,
    kind: "player_forfeit",
    at: now,
    forfeitUserId: userId,
  });

  await supabase.from("celo_audit_log").insert({
    room_id: roomId,
    round_id: roundId,
    user_id: userId,
    action: "short_stop_forfeit",
    details: { roll_id: rollId, stake_cents: stake },
  });

  return NextResponse.json({ success: true, forfeited: true });
}
