import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { creditGpayIdempotent, getUserCoins } from "@/lib/coins";
import { comparePoints, evaluateRoll, rollThreeDice } from "@/lib/celo-engine";
import { insertCeloPlatformFee } from "@/lib/celo-platform-fee";
import {
  celoAccountingAuditLog,
  celoAccountingLog,
  celoApplyRoundBankerAccountingDelta,
  celoAdjustRoomBank,
  celoStakeNetAndPlatformFee,
  celoUpdateRoundIfStatus,
} from "@/lib/celo-accounting";
import { runCeloSideBetSettlementAfterRoundComplete } from "@/lib/celo-sidebet-settlement";
import { handleCeloBankBustAndBankerTransfer } from "@/lib/celo-bank-bust";
import { isRoomPauseBlockingActions } from "@/lib/celo-pause";
import { nextPlayerRollDeadlineIso } from "@/lib/celo-player-roll-constants";
import {
  buildCeloClientPlayerRoll,
  effectiveCeloStakeSc as effectiveStakeSc,
  finishOrAdvanceAfterPlayerResolvingRoll,
  getCeloStakedPlayersOrdered as getStakedPlayersOrdered,
  resetCeloRoomEntries as resetRoomEntries,
  resolvePlayerRollTimeout,
} from "@/lib/celo-player-timeout";

const ROLL_ANIMATION_MS = 1500;
/** Pause after terminal round writes so clients can display final dice/outcome before reset. */
const RESULT_DISPLAY_MS = 4000;

async function delayBeforeRoomReset(): Promise<void> {
  await new Promise((r) => setTimeout(r, RESULT_DISPLAY_MS));
}

/** Player won: debit bank, then bust / banker transfer if bank emptied or full bank-cover win. */
async function playerWinDebitBankAndMaybeBust(
  admin: SupabaseClient,
  ctx: {
    room: RoomRow;
    round: RoundRow;
    userId: string;
    entry: number;
    settlementV2: boolean;
    action: string;
  }
): Promise<{
  net: number;
  fee: number;
  finalBankSc: number;
  bankStopped: boolean;
  oldBankerId: string | null;
  newBankerId: string | null;
}> {
  const { room, round, userId, entry, settlementV2, action } = ctx;
  const oldBankerId = room.banker_id ? String(room.banker_id) : null;
  const { net, fee } = celoStakeNetAndPlatformFee(entry);
  const bankAtRoundStartSc = Math.floor(
    Number(
      (round as { bank_at_round_start_sc?: number | null }).bank_at_round_start_sc ??
        room.current_bank_sc ??
        0
    )
  );
  let finalBankSc = await celoAdjustRoomBank(
    admin,
    room.id,
    settlementV2 ? -entry : -net
  );
  const coverBankStop =
    bankAtRoundStartSc > 0 && entry >= bankAtRoundStartSc;
  const bankStopped = finalBankSc <= 0 || coverBankStop;
  if (coverBankStop && finalBankSc > 0) {
    finalBankSc = await celoAdjustRoomBank(admin, room.id, -finalBankSc);
  }
  const grossWinSc = entry + net;
  let newBankerId: string | null = null;
  if (bankStopped) {
    await handleCeloBankBustAndBankerTransfer({
      admin,
      roomId: room.id,
      newBankSc: finalBankSc,
      bustWinnerUserId: userId,
      action,
    });
    const { data: roomAfterBust } = await admin
      .from("celo_rooms")
      .select("banker_id")
      .eq("id", room.id)
      .maybeSingle();
    const nb = (roomAfterBust as { banker_id?: string | null } | null)?.banker_id;
    newBankerId = nb != null && String(nb).trim() !== "" ? String(nb) : null;
  }
  console.log("[C-Lo bank stop settlement]", {
    roomId: room.id,
    roundId: round.id,
    oldBankerId,
    winnerUserId: userId,
    bankAtRoundStartSc,
    winningStakeSc: entry,
    grossWinSc,
    platformFeeSc: fee,
    finalBankSc,
    bankStopped,
    newBankerId,
  });
  return { net, fee, finalBankSc, bankStopped, oldBankerId, newBankerId };
}

type RoomRow = {
  id: string;
  banker_id: string;
  current_bank_sc: number;
  minimum_entry_sc: number | null;
  min_bet_cents: number | null;
  total_rounds: number;
  last_round_was_celo: boolean;
  banker_celo_at: string | null;
  platform_fee_pct: number;
};

type RoundRow = {
  id: string;
  room_id: string;
  status: string;
  settlement_version?: number | null;
  /** Snapshot when round started; full-cover detection uses stake vs this, not fee-adjusted bank. */
  bank_at_round_start_sc?: number | null;
  banker_id: string | null;
  prize_pool_sc: number | null;
  platform_fee_sc: number | null;
  banker_winnings_sc?: number | null;
  banker_point: number | null;
  current_player_seat: number | null;
  roller_user_id?: string | null;
  /** UTC deadline for the current roller (player_rolling); forfeiture counts as banker win incl. platform fee. */
  player_roll_deadline_at?: string | null;
  banker_dice?: unknown;
  banker_dice_result?: string | null;
  player_celo_offer?: boolean;
  player_celo_expires_at?: string | null;
  /** True when the round ended in a point tie; stakes refunded. */
  push?: boolean;
  /** Server: true while this banker throw is being processed (realtime tumble). */
  banker_roll_in_flight?: boolean;
  roll_processing?: boolean;
  roll_animation_start_at?: string | null;
  roll_animation_duration_ms?: number | null;
};

type PlayerRow = {
  id: string;
  user_id: string;
  role: string;
  entry_sc: number;
  stake_amount_sc?: number;
  bet_cents?: number;
  entry_posted?: boolean;
  seat_number: number | null;
};

export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return celoUnauthorizedJsonResponse();
  }
  const { user, adminClient } = auth;
  const userId = user.id;
  let body: { room_id?: string; round_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "");
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  const { data: pRow, error: pErr } = await adminClient
    .from("celo_room_players")
    .select("id, user_id, role, entry_sc, stake_amount_sc, bet_cents, entry_posted, seat_number")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (pErr || !pRow) {
    return NextResponse.json(
      { error: "You are not in this room" },
      { status: 403 }
    );
  }
  const player = pRow as PlayerRow;
  if (player.role === "spectator") {
    return NextResponse.json(
      { error: "Spectators cannot roll" },
      { status: 400 }
    );
  }
  const { data: roomRaw } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  if (!roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomRaw as RoomRow;
  if (
    isRoomPauseBlockingActions(
      room as { paused_at?: string | null; pause_expires_at?: string | null }
    )
  ) {
    return NextResponse.json({ error: "Room is paused" }, { status: 400 });
  }
  const roundIdArg = body.round_id ? String(body.round_id) : null;
  let round: RoundRow | null = null;
  if (roundIdArg) {
    const { data: r } = await adminClient
      .from("celo_rounds")
      .select("*")
      .eq("id", roundIdArg)
      .eq("room_id", roomId)
      .maybeSingle();
    round = (r as RoundRow) ?? null;
  } else {
    const { data: r } = await adminClient
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .in("status", ["banker_rolling", "player_rolling"])
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    round = (r as RoundRow) ?? null;
  }
  if (!round) {
    return NextResponse.json({ error: "No active round" }, { status: 400 });
  }
  const feePct = room.platform_fee_pct ?? 10;
  if (String(body.action ?? "") === "timeout_forfeit") {
    return handlePlayerRollTimeout(adminClient, { room, round, feePct });
  }
  if (player.role === "banker" || userId === room.banker_id) {
    if (round.status !== "banker_rolling") {
      return NextResponse.json({ error: "Not your turn" }, { status: 400 });
    }
    await adminClient
      .from("celo_rounds")
      .update({ banker_roll_in_flight: false })
      .eq("id", round.id)
      .neq("status", "banker_rolling");
    return handleBankerRoll(adminClient, { room, round, userId, feePct });
  }
  const dice = rollThreeDice();
  const roll = evaluateRoll(dice);
  if (player.role === "player") {
    if (round.status !== "player_rolling") {
      return NextResponse.json({ error: "Not your turn" }, { status: 400 });
    }
    if (effectiveStakeSc(player) <= 0 || player.entry_posted !== true) {
      return NextResponse.json(
        { error: "No entry this round" },
        { status: 400 }
      );
    }
    const { data: finalRoll } = await adminClient
      .from("celo_player_rolls")
      .select("id")
      .eq("round_id", round.id)
      .eq("user_id", userId)
      .in("outcome", ["win", "loss", "push"])
      .limit(1);
    if (finalRoll && finalRoll.length > 0) {
      return NextResponse.json({ error: "Already rolled" }, { status: 400 });
    }
    const seat = player.seat_number ?? 0;
    if (
      round.current_player_seat != null &&
      seat !== round.current_player_seat
    ) {
      return NextResponse.json(
        { error: "Not your turn to roll" },
        { status: 400 }
      );
    }
    return handlePlayerRoll(
      adminClient,
      { room, round, userId, player, dice, roll, feePct }
    );
  }
  return NextResponse.json({ error: "Cannot roll" }, { status: 400 });
}

async function markBankerRollInFlight(
  admin: SupabaseClient,
  roundId: string
): Promise<boolean> {
  const t = new Date().toISOString();
  const { data, error } = await admin
    .from("celo_rounds")
    .update({
      banker_roll_in_flight: true,
      roll_animation_start_at: t,
      roll_animation_duration_ms: ROLL_ANIMATION_MS,
    })
    .eq("id", roundId)
    .eq("status", "banker_rolling")
    .select("id")
    .maybeSingle();
  if (error) {
    celoAccountingLog("banker_roll_in_flight_set_error", {
      roundId,
      message: error.message,
    });
    return false;
  }
  if (!data?.id) return false;
  celoAccountingLog("banker_roll_in_flight_set", { roundId });
  celoAccountingAuditLog("banker_roll_in_flight_set", { roundId });
  return true;
}

async function clearBankerRollInFlight(
  admin: SupabaseClient,
  roundId: string,
  reason: string
): Promise<void> {
  await admin
    .from("celo_rounds")
    .update({ banker_roll_in_flight: false })
    .eq("id", roundId);
  celoAccountingLog("banker_roll_in_flight_cleared", { roundId, reason });
  celoAccountingAuditLog("banker_roll_in_flight_cleared", { roundId, reason });
}

async function handleBankerRoll(
  admin: SupabaseClient,
  ctx: {
    room: RoomRow;
    round: RoundRow;
    userId: string;
    feePct: number;
  }
) {
  const { room, round, userId, feePct } = ctx;

  const marked = await markBankerRollInFlight(admin, round.id);
  if (!marked) {
    const { data: cur } = await admin
      .from("celo_rounds")
      .select("id, status, banker_dice, banker_dice_name, banker_dice_result")
      .eq("id", round.id)
      .maybeSingle();
    const st = (cur as { status?: string } | null)?.status;
    if (st !== "banker_rolling") {
      return NextResponse.json(
        { error: "Round is not in banker rolling state" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Could not mark banker roll in flight" },
      { status: 409 }
    );
  }

  const dice = rollThreeDice();
  const roll = evaluateRoll(dice);
  const diceArr = [dice[0], dice[1], dice[2]];
  console.log("[C-Lo SERVER ROLL]", {
    who: "banker" as const,
    dice: diceArr,
    rollName: roll.rollName,
    result: roll.result,
    point: roll.point,
    roundId: round.id,
  });
  await new Promise((r) => setTimeout(r, ROLL_ANIMATION_MS));
  const now = new Date().toISOString();

  if (roll.result === "no_count") {
    celoAccountingLog("banker_no_count_throw", {
      roundId: round.id,
      priorBankerDice: round.banker_dice != null,
    });
    console.log("[celo/roll] no_count: pre celoUpdateRoundIfStatus", {
      roundId: round.id,
      diceArr,
    });
    const updated = await celoUpdateRoundIfStatus(admin, round.id, ["banker_rolling"], {
      banker_dice: diceArr,
      banker_dice_name: roll.rollName,
      banker_dice_result: roll.result,
      banker_roll_in_flight: false,
    });
    console.log("[celo/roll] no_count: post celoUpdateRoundIfStatus", {
      roundId: round.id,
      updated: !!updated,
    });
    if (!updated) {
      await clearBankerRollInFlight(admin, round.id, "no_count_update_race");
      celoAccountingLog("banker_no_count_skip", { roundId: round.id });
      const { data: cur } = await admin
        .from("celo_rounds")
        .select("status, banker_dice, banker_dice_name, banker_dice_result")
        .eq("id", round.id)
        .maybeSingle();
      if (cur?.status === "banker_rolling" && Array.isArray(cur.banker_dice)) {
        const d = cur.banker_dice as number[];
        return NextResponse.json({
          dice: [d[0], d[1], d[2]] as [number, number, number],
          rollName: cur.banker_dice_name,
          result: cur.banker_dice_result,
          outcome: "reroll",
          isCelo: roll.isCelo,
        });
      }
      return NextResponse.json(
        { error: "Round is not in banker rolling state" },
        { status: 409 }
      );
    }
    celoAccountingLog("banker_roll_in_flight_cleared", {
      roundId: round.id,
      reason: "no_count",
    });
    celoAccountingAuditLog("banker_roll_in_flight_cleared", {
      roundId: round.id,
      reason: "no_count",
    });
    return NextResponse.json({
      dice,
      rollName: roll.rollName,
      result: roll.result,
      outcome: "reroll",
      isCelo: roll.isCelo,
    });
  }

  if (roll.result === "instant_win") {
    const { data: stakedIw } = await admin
      .from("celo_room_players")
      .select("user_id, entry_sc, stake_amount_sc, bet_cents, role, entry_posted")
      .eq("room_id", room.id);

    let bankerWins = 0;
    let totalPlatformFee = 0;
    for (const p of stakedIw ?? []) {
      if (p.role !== "player") continue;
      const e = effectiveStakeSc(p);
      if (e <= 0) continue;
      const { net, fee } = celoStakeNetAndPlatformFee(e);
      bankerWins += net;
      totalPlatformFee += fee;
    }

    const payoutRef = `celo_round_banker_win_${round.id}`;

    celoAccountingLog("banker_instant_win_payout_attempt", {
      roundId: round.id,
      userId,
      bankerWins,
      reference: payoutRef,
    });
    const cr = await creditGpayIdempotent(
      userId,
      bankerWins,
      "C-Lo round (banker table)",
      payoutRef,
      "celo_payout"
    );
    if (!cr.success) {
      celoAccountingLog("banker_instant_win_payout_fail", {
        roundId: round.id,
        message: cr.message,
      });
      await clearBankerRollInFlight(admin, round.id, "instant_win_credit_failed");
      return NextResponse.json(
        { error: cr.message ?? "Credit failed" },
        { status: 500 }
      );
    }

    const { data: finalized, error: finErr } = await admin
      .from("celo_rounds")
      .update({
        banker_dice: diceArr,
        banker_dice_name: roll.rollName,
        banker_dice_result: roll.result,
        banker_roll_in_flight: false,
        status: "completed",
        platform_fee_sc: totalPlatformFee,
        banker_winnings_sc: bankerWins,
        completed_at: now,
      })
      .eq("id", round.id)
      .eq("status", "banker_rolling")
      .select("id")
      .maybeSingle();

    if (finErr) {
      celoAccountingLog("banker_instant_win_finalize_err", {
        roundId: round.id,
        message: finErr.message,
      });
      await clearBankerRollInFlight(admin, round.id, "instant_win_finalize_err");
      return NextResponse.json(
        { error: finErr.message ?? "Finalize failed" },
        { status: 500 }
      );
    }

    if (!finalized) {
      const { data: cur } = await admin
        .from("celo_rounds")
        .select(
          "status, banker_dice, banker_dice_name, banker_dice_result, platform_fee_sc, banker_winnings_sc"
        )
        .eq("id", round.id)
        .maybeSingle();
      celoAccountingLog("banker_instant_win_finalize_skip", {
        roundId: round.id,
        status: cur?.status,
      });
      celoAccountingAuditLog("settlement_finalize_skipped_already_complete", {
        path: "banker_instant_win",
        roundId: round.id,
        status: cur?.status,
        reason: "conditional_update_0_rows_or_idempotent",
      });
      if (
        cur?.status === "completed" &&
        cur.banker_dice_result === "instant_win"
      ) {
        const { data: roomFresh } = await admin
          .from("celo_rooms")
          .select("current_bank_sc")
          .eq("id", room.id)
          .maybeSingle();
        const nb = Math.max(
          0,
          Math.floor(
            Number((roomFresh as { current_bank_sc?: number })?.current_bank_sc) ||
              room.current_bank_sc
          )
        );
        const idemBw = Math.floor(
          Number((cur as { banker_winnings_sc?: number }).banker_winnings_sc ?? bankerWins)
        );
        return NextResponse.json({
          idempotent: true,
          dice: Array.isArray(cur.banker_dice)
            ? (cur.banker_dice as [number, number, number])
            : dice,
          rollName: cur.banker_dice_name ?? roll.rollName,
          result: cur.banker_dice_result,
          outcome: "banker_wins",
          isCelo: roll.isCelo,
          bankerWins: idemBw,
          newBank: nb,
          canLowerBank: roll.isCelo,
        });
      }
      await clearBankerRollInFlight(admin, round.id, "instant_win_finalize_stuck_after_credit");
      return NextResponse.json(
        { error: "Could not finalize round after payout" },
        { status: 500 }
      );
    }

    celoAccountingLog("banker_roll_in_flight_cleared", {
      roundId: round.id,
      reason: "instant_win",
    });
    celoAccountingAuditLog("banker_roll_in_flight_cleared", {
      roundId: round.id,
      reason: "instant_win",
    });

    await insertCeloPlatformFee(
      admin,
      totalPlatformFee,
      "banker_instant_win",
      {
        roundId: round.id,
        idempotencyKey: `celo_fee_round_${round.id}_banker_instant_win`,
      }
    );
    const newBank = await celoAdjustRoomBank(admin, room.id, bankerWins);
    await delayBeforeRoomReset();
    await admin
      .from("celo_rooms")
      .update({
        last_round_was_celo: roll.isCelo,
        banker_celo_at: roll.isCelo ? now : room.banker_celo_at,
        total_rounds: (room.total_rounds ?? 0) + 1,
        last_activity: now,
        status: "waiting",
      })
      .eq("id", room.id);
    await resetRoomEntries(admin, room.id);
    await runCeloSideBetSettlementAfterRoundComplete(
      admin,
      room.id,
      round.id,
      feePct
    );
    celoAccountingLog("banker_instant_win_done", {
      roundId: round.id,
      newBank,
      reference: payoutRef,
    });
    return NextResponse.json({
      dice,
      rollName: roll.rollName,
      result: roll.result,
      outcome: "banker_wins",
      isCelo: roll.isCelo,
      bankerWins,
      newBank,
      canLowerBank: roll.isCelo,
    });
  }

  if (roll.result === "instant_loss") {
    const { data: staked } = await admin
      .from("celo_room_players")
      .select(
        "user_id, entry_sc, stake_amount_sc, bet_cents, role, entry_posted, seat_number"
      )
      .eq("room_id", room.id);

    let totalStakeFromBank = 0;
    let totalNetFromBank = 0;
    let totalPlatformFee = 0;
    let bustWinnerInstantLoss: string | null = null;
    let bustBestCredit = -1;
    let bustBestSeat = 9999;

    for (const p of staked ?? []) {
      if (p.role !== "player") continue;
      const e = effectiveStakeSc(p);
      if (e <= 0) continue;
      const { net, fee } = celoStakeNetAndPlatformFee(e);
      totalStakeFromBank += e;
      totalNetFromBank += net;
      totalPlatformFee += fee;
      const creditAmt = e + net;
      const sn = Math.floor(
        Number((p as { seat_number?: number | null }).seat_number ?? 9999)
      );
      if (
        creditAmt > bustBestCredit ||
        (creditAmt === bustBestCredit && sn < bustBestSeat)
      ) {
        bustBestCredit = creditAmt;
        bustBestSeat = sn;
        bustWinnerInstantLoss = String(p.user_id);
      }
      const ref = `celo_round_players_win_${round.id}_${p.user_id}`;
      celoAccountingLog("instant_loss_payout_attempt", {
        roundId: round.id,
        userId: p.user_id,
        net,
        creditAmt,
        reference: ref,
      });
      const c = await creditGpayIdempotent(
        p.user_id,
        creditAmt,
        "C-Lo round (players earn vs banker loss)",
        ref,
        "celo_payout"
      );
      if (!c.success) {
        celoAccountingLog("instant_loss_payout_fail", {
          roundId: round.id,
          userId: p.user_id,
          message: c.message,
        });
        await clearBankerRollInFlight(admin, round.id, "instant_loss_payout_failed");
        return NextResponse.json(
          { error: c.message ?? "Player payout failed" },
          { status: 500 }
        );
      }
    }

    const { data: finalized } = await admin
      .from("celo_rounds")
      .update({
        banker_dice: diceArr,
        banker_dice_name: roll.rollName,
        banker_dice_result: roll.result,
        banker_roll_in_flight: false,
        status: "completed",
        completed_at: now,
        banker_winnings_sc: -totalNetFromBank,
        platform_fee_sc: totalPlatformFee,
      })
      .eq("id", round.id)
      .eq("status", "banker_rolling")
      .select("id")
      .maybeSingle();

    if (!finalized) {
      const { data: cur } = await admin
        .from("celo_rounds")
        .select("status, banker_dice, banker_dice_name, banker_dice_result")
        .eq("id", round.id)
        .maybeSingle();
      celoAccountingLog("instant_loss_finalize_skip", {
        roundId: round.id,
        status: cur?.status,
      });
      celoAccountingAuditLog("settlement_finalize_skipped_already_complete", {
        path: "banker_instant_loss",
        roundId: round.id,
        status: cur?.status,
      });
      if (
        cur?.status === "completed" &&
        cur.banker_dice_result === "instant_loss"
      ) {
        return NextResponse.json({
          idempotent: true,
          dice: Array.isArray(cur.banker_dice)
            ? (cur.banker_dice as [number, number, number])
            : dice,
          rollName: cur.banker_dice_name ?? roll.rollName,
          result: cur.banker_dice_result,
          outcome: "players_win",
        });
      }
      await clearBankerRollInFlight(admin, round.id, "instant_loss_finalize_failed");
      return NextResponse.json(
        { error: "Could not finalize round after payouts" },
        { status: 500 }
      );
    }

    celoAccountingLog("banker_roll_in_flight_cleared", {
      roundId: round.id,
      reason: "instant_loss",
    });
    celoAccountingAuditLog("banker_roll_in_flight_cleared", {
      roundId: round.id,
      reason: "instant_loss",
    });

    const newBankAfterLoss = await celoAdjustRoomBank(
      admin,
      room.id,
      Number(round.settlement_version ?? 1) >= 2
        ? -totalStakeFromBank
        : -totalNetFromBank
    );
    await handleCeloBankBustAndBankerTransfer({
      admin,
      roomId: room.id,
      newBankSc: newBankAfterLoss,
      bustWinnerUserId: bustWinnerInstantLoss,
      action: "banker_instant_loss",
    });
    await insertCeloPlatformFee(
      admin,
      totalPlatformFee,
      "banker_instant_loss",
      {
        roundId: round.id,
        idempotencyKey: `celo_fee_round_${round.id}_banker_instant_loss`,
      }
    );

    await delayBeforeRoomReset();
    await admin
      .from("celo_rooms")
      .update({
        last_round_was_celo: false,
        total_rounds: (room.total_rounds ?? 0) + 1,
        last_activity: now,
        status: "waiting",
      })
      .eq("id", room.id);
    await resetRoomEntries(admin, room.id);
    await runCeloSideBetSettlementAfterRoundComplete(
      admin,
      room.id,
      round.id,
      feePct
    );
    celoAccountingLog("instant_loss_done", { roundId: round.id });
    return NextResponse.json({
      dice,
      rollName: roll.rollName,
      result: roll.result,
      outcome: "players_win",
    });
  }

  if (roll.result === "point" && roll.point != null) {
    const staked = await getStakedPlayersOrdered(admin, room.id);
    const firstSeat = staked[0]?.seat_number ?? 1;
    console.log("[celo/roll] point: pre celoUpdateRoundIfStatus", {
      roundId: round.id,
      diceArr,
    });
    const updated = await celoUpdateRoundIfStatus(admin, round.id, ["banker_rolling"], {
      banker_dice: diceArr,
      banker_dice_name: roll.rollName,
      banker_dice_result: roll.result,
      banker_point: roll.point,
      banker_roll_in_flight: false,
      status: "player_rolling",
      current_player_seat: firstSeat,
      roller_user_id: staked[0]?.user_id ?? null,
      player_roll_deadline_at: nextPlayerRollDeadlineIso(),
    });
    console.log("[celo/roll] point: post celoUpdateRoundIfStatus", {
      roundId: round.id,
      updated: !!updated,
    });
    if (!updated) {
      await clearBankerRollInFlight(admin, round.id, "banker_point_transition_race");
      const { data: cur } = await admin
        .from("celo_rounds")
        .select(
          "status, banker_point, banker_dice, banker_dice_name, banker_dice_result, current_player_seat"
        )
        .eq("id", round.id)
        .maybeSingle();
      celoAccountingLog("banker_point_transition_skip", {
        roundId: round.id,
        status: cur?.status,
      });
      if (cur?.status === "player_rolling") {
        return NextResponse.json({
          idempotent: true,
          dice: Array.isArray(cur.banker_dice)
            ? (cur.banker_dice as [number, number, number])
            : dice,
          rollName: cur.banker_dice_name ?? roll.rollName,
          result: cur.banker_dice_result,
          point: cur.banker_point,
          outcome: "players_must_roll",
        });
      }
      return NextResponse.json(
        { error: "Round is not in banker rolling state" },
        { status: 409 }
      );
    }
    celoAccountingLog("banker_roll_in_flight_cleared", {
      roundId: round.id,
      reason: "point_transition",
    });
    celoAccountingAuditLog("banker_roll_in_flight_cleared", {
      roundId: round.id,
      reason: "point_transition",
    });
    return NextResponse.json({
      dice,
      rollName: roll.rollName,
      result: roll.result,
      point: roll.point,
      outcome: "players_must_roll",
    });
  }
  await clearBankerRollInFlight(admin, round.id, "unexpected_banker_roll_branch");
  return NextResponse.json(
    { error: "Unexpected banker roll state" },
    { status: 500 }
  );
}

async function clearPlayerRollProcessing(
  admin: SupabaseClient,
  roundId: string
): Promise<void> {
  await admin
    .from("celo_rounds")
    .update({ roll_processing: false })
    .eq("id", roundId);
}

async function handlePlayerRoll(
  admin: SupabaseClient,
  ctx: {
    room: RoomRow;
    round: RoundRow;
    userId: string;
    player: PlayerRow;
    dice: [number, number, number];
    roll: ReturnType<typeof evaluateRoll>;
    feePct: number;
  }
) {
  const { room, round, userId, player, dice, roll, feePct } = ctx;
  const settlementV2 = Number(round.settlement_version ?? 1) >= 2;

  if (round.banker_point == null) {
    return NextResponse.json(
      { error: "Banker has not set a point" },
      { status: 400 }
    );
  }
  const bankerPoint = round.banker_point;

  const logDice = [dice[0], dice[1], dice[2]];
  console.log("[C-Lo SERVER ROLL]", {
    who: "player" as const,
    dice: logDice,
    rollName: roll.rollName,
    result: roll.result,
    point: roll.point,
    roundId: round.id,
  });

  const animT = new Date().toISOString();
  const { error: animErr } = await admin
    .from("celo_rounds")
    .update({
      roll_processing: true,
      roll_animation_start_at: animT,
      roll_animation_duration_ms: ROLL_ANIMATION_MS,
    })
    .eq("id", round.id)
    .eq("room_id", room.id)
    .eq("status", "player_rolling");
  if (animErr) {
    return NextResponse.json(
      { error: animErr.message ?? "Could not start roll animation" },
      { status: 500 }
    );
  }

  await new Promise((r) => setTimeout(r, ROLL_ANIMATION_MS));

  const now = new Date().toISOString();
  let insertedRow: Record<string, unknown> | null = null;
  const entry = effectiveStakeSc(player);
  let outcome: "win" | "loss" | "reroll" = "loss";
  let payoutSc = 0;
  let playerCanBecomeBanker = false;
  let bankStoppedAfterWin = false;
  let bankStopOldBankerId: string | null = null;
  let bankStopNewBankerId: string | null = null;
  const bankerTakeoverOffered = roll.isCelo && roll.result === "instant_win";
  let body: {
    roundOut: Record<string, unknown> | null;
    roomOut: Record<string, unknown> | null;
  } = { roundOut: null, roomOut: null };

  try {
    const bankerDiceResult = String(round.banker_dice_result ?? "");
    if (
      roll.result === "point" &&
      roll.point != null &&
      bankerDiceResult === "point" &&
      Number(roll.point) === Number(bankerPoint)
    ) {
      const { data: refundRows } = await admin
        .from("celo_room_players")
        .select(
          "id, user_id, entry_sc, stake_amount_sc, bet_cents, role, entry_posted, seat_number"
        )
        .eq("room_id", room.id)
        .eq("role", "player");
      for (const pr of refundRows ?? []) {
        const prow = pr as PlayerRow;
        if (prow.entry_posted !== true) continue;
        const refundAmt = effectiveStakeSc(prow);
        if (refundAmt <= 0) continue;
        const refKey = `celo_push_refund_${round.id}_${prow.user_id}`;
        const cr = await creditGpayIdempotent(
          prow.user_id,
          refundAmt,
          "C-Lo push (point tie) — stake refund",
          refKey,
          "celo_payout"
        );
        if (!cr.success) {
          return NextResponse.json(
            { error: cr.message ?? "Push refund failed" },
            { status: 500 }
          );
        }
      }

      const diceArr = [dice[0], dice[1], dice[2]] as [number, number, number];
      const { data: ins, error: insErr } = await admin
        .from("celo_player_rolls")
        .insert({
          round_id: round.id,
          room_id: room.id,
          user_id: userId,
          dice: diceArr,
          roll_name: roll.rollName,
          roll_result: roll.result,
          point: roll.point,
          entry_sc: entry,
          outcome: "push",
          payout_sc: entry,
          platform_fee_sc: 0,
        })
        .select("*")
        .single();
      if (insErr || !ins) {
        return NextResponse.json(
          {
            ok: false as const,
            error: insErr?.message ?? "Failed to save push roll",
          },
          { status: 500 }
        );
      }

      const { data: finalizedPush } = await admin
        .from("celo_rounds")
        .update({
          status: "completed",
          completed_at: now,
          push: true,
          banker_winnings_sc: 0,
          platform_fee_sc: 0,
        })
        .eq("id", round.id)
        .eq("room_id", room.id)
        .eq("status", "player_rolling")
        .select("id")
        .maybeSingle();

      if (finalizedPush) {
        await delayBeforeRoomReset();
        await admin
          .from("celo_rooms")
          .update({
            total_rounds: (room.total_rounds ?? 0) + 1,
            last_activity: now,
            status: "waiting",
          })
          .eq("id", room.id);
        await resetRoomEntries(admin, room.id);
        await runCeloSideBetSettlementAfterRoundComplete(
          admin,
          room.id,
          round.id,
          feePct
        );
        celoAccountingLog("celo_round_push_complete", { roundId: round.id });
      }

      const { data: roundOutPush } = await admin
        .from("celo_rounds")
        .select("*")
        .eq("id", round.id)
        .maybeSingle();
      const { data: roomOutPush } = await admin
        .from("celo_rooms")
        .select("*")
        .eq("id", room.id)
        .maybeSingle();
      const { gpayCoins: coinsAfterPush } = await getUserCoins(userId);
      const clientRollPush = buildCeloClientPlayerRoll(
        ins as Record<string, unknown>,
        dice,
        {
          createdAt: now,
          userId,
          roomId: room.id,
          roundId: round.id,
        }
      );
      const roundPatchedPush =
        roundOutPush == null
          ? null
          : {
              ...(roundOutPush as Record<string, unknown>),
              roll_processing: false,
            };
      return NextResponse.json({
        ok: true as const,
        push: true,
        roll: clientRollPush,
        round: roundPatchedPush,
        room: roomOutPush,
        currentRound: roundPatchedPush,
        dice,
        rollName: roll.rollName,
        result: roll.result,
        point: roll.point,
        outcome: "push" as const,
        payoutSc: entry,
        newBalance: coinsAfterPush,
        player_can_become_banker: false,
        player_must_have_sc: room.current_bank_sc,
        isCelo: roll.isCelo,
        roundComplete: true,
        banker_takeover_offered: false,
        player_user_id: userId,
      });
    }

    if (roll.result === "instant_win") {
      const { net, fee } = celoStakeNetAndPlatformFee(entry);
      const creditAmt = entry + net;
      const winRef = `celo_player_win_${round.id}_${userId}`;
      celoAccountingLog("player_roll_instant_win_payout_attempt", {
        roundId: round.id,
        userId,
        net,
        creditAmt,
        reference: winRef,
      });
      const c = await creditGpayIdempotent(
        userId,
        creditAmt,
        "C-Lo player roll (instant win)",
        winRef,
        "celo_payout"
      );
      if (!c.success) {
        return NextResponse.json(
          { error: c.message ?? "Credit failed" },
          { status: 500 }
        );
      }
      const settleIw = await playerWinDebitBankAndMaybeBust(admin, {
        room,
        round,
        userId,
        entry,
        settlementV2,
        action: "player_instant_win",
      });
      bankStoppedAfterWin = settleIw.bankStopped;
      bankStopOldBankerId = settleIw.oldBankerId;
      bankStopNewBankerId = settleIw.newBankerId;
      await celoApplyRoundBankerAccountingDelta(admin, round.id, -net, fee);
      outcome = "win";
      payoutSc = creditAmt;
      playerCanBecomeBanker = roll.isCelo && !settleIw.bankStopped;
      if (roll.isCelo && !settleIw.bankStopped) {
        await admin
          .from("celo_rounds")
          .update({
            player_celo_offer: true,
            player_celo_expires_at: new Date(
              Date.now() + 30_000
            ).toISOString(),
          })
          .eq("id", round.id);
      }
    } else if (roll.result === "instant_loss") {
      outcome = "loss";
    } else if (roll.result === "point" && roll.point != null) {
      const cmp = comparePoints(roll.point, bankerPoint);
      if (cmp === "win") {
        const { net, fee } = celoStakeNetAndPlatformFee(entry);
        const creditAmt = entry + net;
        const ptRef = `celo_player_point_${round.id}_${userId}`;
        celoAccountingLog("player_roll_point_win_payout_attempt", {
          roundId: round.id,
          userId,
          net,
          creditAmt,
          reference: ptRef,
        });
        const pc = await creditGpayIdempotent(
          userId,
          creditAmt,
          "C-Lo player point win",
          ptRef,
          "celo_payout"
        );
        if (!pc.success) {
          return NextResponse.json(
            { error: pc.message ?? "Credit failed" },
            { status: 500 }
          );
        }
        const settlePt = await playerWinDebitBankAndMaybeBust(admin, {
          room,
          round,
          userId,
          entry,
          settlementV2,
          action: "player_point_win",
        });
        bankStoppedAfterWin = settlePt.bankStopped;
        bankStopOldBankerId = settlePt.oldBankerId;
        bankStopNewBankerId = settlePt.newBankerId;
        await celoApplyRoundBankerAccountingDelta(admin, round.id, -net, fee);
        outcome = "win";
        payoutSc = creditAmt;
      } else {
        outcome = "loss";
      }
    } else {
      outcome = "reroll";
    }
    if (outcome === "loss") {
      const { net, fee } = celoStakeNetAndPlatformFee(entry);
      await celoAdjustRoomBank(admin, room.id, net);
      await celoApplyRoundBankerAccountingDelta(admin, round.id, net, fee);
    }
    if (outcome !== "reroll") {
      const feeForRoll =
        outcome === "win" || outcome === "loss"
          ? celoStakeNetAndPlatformFee(entry).fee
          : 0;
      const diceArr = [dice[0], dice[1], dice[2]];
      const { data: ins, error: insErr } = await admin
        .from("celo_player_rolls")
        .insert({
          round_id: round.id,
          room_id: room.id,
          user_id: userId,
          dice: diceArr,
          roll_name: roll.rollName,
          roll_result: roll.result,
          point: roll.point,
          entry_sc: entry,
          outcome,
          payout_sc: payoutSc,
          platform_fee_sc: feeForRoll,
        })
        .select("*")
        .single();
      if (insErr || !ins) {
        return NextResponse.json(
          { ok: false as const, error: insErr?.message ?? "Failed to save player roll" },
          { status: 500 }
        );
      }
      insertedRow = ins as Record<string, unknown>;
      await admin
        .from("celo_room_players")
        .update({ entry_sc: 0, bet_cents: 0, stake_amount_sc: 0 })
        .eq("id", player.id);
    }
    let newBalance: number | undefined;
    if (outcome !== "reroll") {
      const { gpayCoins } = await getUserCoins(userId);
      newBalance = gpayCoins;
    }
    let hasMore = true;
    if (outcome !== "reroll") {
      const adv = await finishOrAdvanceAfterPlayerResolvingRoll(admin, {
        room,
        round,
        feePct,
        now,
      });
      hasMore = adv.hasMore;
    }

    const { data: roundOut } = await admin
      .from("celo_rounds")
      .select("*")
      .eq("id", round.id)
      .maybeSingle();
    const { data: roomOut } = await admin
      .from("celo_rooms")
      .select("*")
      .eq("id", room.id)
      .maybeSingle();
    body = { roundOut: (roundOut as Record<string, unknown>) ?? null, roomOut: (roomOut as Record<string, unknown>) ?? null };
    const clientRoll = buildCeloClientPlayerRoll(insertedRow, dice, {
      createdAt: now,
      userId,
      roomId: room.id,
      roundId: round.id,
    });
    const roundPatched =
      body.roundOut == null
        ? null
        : { ...body.roundOut, roll_processing: false };

    const roomOutSc = Math.max(
      0,
      Math.floor(
        Number(
          (body.roomOut as { current_bank_sc?: number } | null)?.current_bank_sc ??
            room.current_bank_sc ??
            0
        )
      )
    );
    const bankStopMessage =
      bankStoppedAfterWin && bankStopNewBankerId
        ? "You stopped the bank. You are now the banker."
        : null;
    if (bankStoppedAfterWin) {
      console.log("[C-Lo bank stop message]", {
        roomId: room.id,
        roundId: round.id,
        oldBankerId: bankStopOldBankerId,
        newBankerId: bankStopNewBankerId,
        currentUserId: userId,
        currentBankSc: roomOutSc,
        bankStopped: true,
        modalWouldOpen: false,
      });
    }
    return NextResponse.json({
      ok: true as const,
      roll: clientRoll,
      round: roundPatched,
      room: body.roomOut,
      currentRound: roundPatched,
      dice,
      rollName: roll.rollName,
      result: roll.result,
      point: roll.point,
      outcome: outcome === "reroll" ? "reroll" : outcome,
      payoutSc: outcome === "reroll" ? 0 : payoutSc,
      newBalance,
      player_can_become_banker: playerCanBecomeBanker,
      player_must_have_sc: roomOutSc,
      isCelo: roll.isCelo,
      roundComplete: outcome === "reroll" ? false : !hasMore,
      banker_takeover_offered: bankerTakeoverOffered && !bankStoppedAfterWin,
      player_user_id: userId,
      bankStopped: bankStoppedAfterWin,
      oldBankerId: bankStopOldBankerId,
      newBankerId: bankStopNewBankerId,
      setupRequired: bankStoppedAfterWin === true,
      message: bankStopMessage,
    });
  } finally {
    await clearPlayerRollProcessing(admin, round.id);
  }
}

async function handlePlayerRollTimeout(
  admin: SupabaseClient,
  ctx: { room: RoomRow; round: RoundRow; feePct: number }
): Promise<NextResponse> {
  const result = await resolvePlayerRollTimeout(admin, {
    room: ctx.room,
    round: ctx.round,
    feePct: ctx.feePct,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.body);
}
