/**
 * C-Lo player-phase settlement shared by POST /api/celo/round/roll (timeout_forfeit)
 * and the cron backup sweep. Single code path preserves platform fee idempotency keys.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserCoins } from "@/lib/coins";
import { insertCeloPlatformFee } from "@/lib/celo-platform-fee";
import { runCeloSideBetSettlementAfterRoundComplete } from "@/lib/celo-sidebet-settlement";
import {
  celoAccountingAuditLog,
  celoAccountingLog,
  celoApplyRoundBankerAccountingDelta,
  celoAdjustRoomBank,
  celoStakeNetAndPlatformFee,
} from "@/lib/celo-accounting";
import { nextPlayerRollDeadlineIso } from "@/lib/celo-player-roll-constants";
import { isRoomPauseBlockingActions } from "@/lib/celo-pause";
import { nextRoomStatusAfterRoundComplete } from "@/lib/celo-room-status";

const RESULT_DISPLAY_MS = 4000;

async function delayBeforeRoomReset(): Promise<void> {
  await new Promise((r) => setTimeout(r, RESULT_DISPLAY_MS));
}

/** Same stake resolution as roll/route (entry_sc / bet_cents / stake_amount_sc). */
export function effectiveCeloStakeSc(row: {
  entry_sc?: unknown;
  bet_cents?: unknown;
  stake_amount_sc?: unknown;
}): number {
  return Math.max(
    Math.floor(Number(row?.entry_sc ?? 0)),
    Math.floor(Number(row?.bet_cents ?? 0)),
    Math.floor(Number(row?.stake_amount_sc ?? 0))
  );
}

export type CeloPlayerRollTimeoutRoom = {
  id: string;
  banker_id: string;
  current_bank_sc: number;
  minimum_entry_sc: number | null;
  min_bet_cents: number | null;
  total_rounds: number;
  last_round_was_celo: boolean;
  banker_celo_at: string | null;
  platform_fee_pct: number;
  paused_at?: string | null;
  pause_expires_at?: string | null;
};

export type CeloPlayerRollTimeoutRound = {
  id: string;
  room_id: string;
  status: string;
  settlement_version?: number | null;
  bank_at_round_start_sc?: number | null;
  banker_id: string | null;
  prize_pool_sc: number | null;
  platform_fee_sc: number | null;
  banker_winnings_sc?: number | null;
  banker_point: number | null;
  current_player_seat: number | null;
  roller_user_id?: string | null;
  player_roll_deadline_at?: string | null;
  banker_dice?: unknown;
  banker_dice_result?: string | null;
  player_celo_offer?: boolean;
  player_celo_expires_at?: string | null;
  push?: boolean;
  banker_roll_in_flight?: boolean;
  roll_processing?: boolean;
  roll_animation_start_at?: string | null;
  roll_animation_duration_ms?: number | null;
};

export type CeloPlayerRollTimeoutPlayer = {
  id: string;
  user_id: string;
  role: string;
  entry_sc: number;
  stake_amount_sc?: number;
  bet_cents?: number;
  entry_posted?: boolean;
  seat_number: number | null;
};

export async function resetCeloRoomEntries(admin: SupabaseClient, roomId: string): Promise<void> {
  await admin
    .from("celo_room_players")
    .update({
      entry_sc: 0,
      bet_cents: 0,
      stake_amount_sc: 0,
      entry_posted: false,
      status: "seated",
      player_seat_status: "seated",
    })
    .eq("room_id", roomId)
    .neq("role", "banker");
}

export async function getCeloStakedPlayersOrdered(
  admin: SupabaseClient,
  roomId: string
): Promise<Pick<CeloPlayerRollTimeoutPlayer, "user_id" | "entry_sc" | "seat_number">[]> {
  const { data } = await admin
    .from("celo_room_players")
    .select("user_id, entry_sc, stake_amount_sc, bet_cents, seat_number, role, entry_posted")
    .eq("room_id", roomId);
  return (data ?? [])
    .filter(
      (p) =>
        p.role === "player" &&
        effectiveCeloStakeSc(p) > 0 &&
        (p as CeloPlayerRollTimeoutPlayer).entry_posted === true
    )
    .sort((a, b) => (a.seat_number ?? 999) - (b.seat_number ?? 999)) as Pick<
    CeloPlayerRollTimeoutPlayer,
    "user_id" | "entry_sc" | "seat_number"
  >[];
}

/** After a resolving player roll (or timeout forfeit), complete the round or advance seat + roll deadline. */
export async function finishOrAdvanceAfterPlayerResolvingRoll(
  admin: SupabaseClient,
  ctx: {
    room: CeloPlayerRollTimeoutRoom;
    round: CeloPlayerRollTimeoutRound;
    feePct: number;
    now: string;
  }
): Promise<{ hasMore: boolean }> {
  const { room, round, feePct, now } = ctx;
  const { data: left } = await admin
    .from("celo_room_players")
    .select("entry_sc, stake_amount_sc, bet_cents, role, seat_number")
    .eq("room_id", room.id)
    .eq("role", "player");
  const anyLeft = (left ?? []).some((p) => effectiveCeloStakeSc(p) > 0);
  if (!anyLeft) {
    const { data: accSnap } = await admin
      .from("celo_rounds")
      .select("banker_winnings_sc, platform_fee_sc")
      .eq("id", round.id)
      .maybeSingle();
    const bw = Math.floor(
      Number((accSnap as { banker_winnings_sc?: number })?.banker_winnings_sc ?? 0)
    );
    const pf = Math.floor(
      Number((accSnap as { platform_fee_sc?: number })?.platform_fee_sc ?? 0)
    );
    const { data: finalized } = await admin
      .from("celo_rounds")
      .update({
        status: "completed",
        completed_at: now,
        banker_winnings_sc: bw,
        platform_fee_sc: pf,
      })
      .eq("id", round.id)
      .eq("status", "player_rolling")
      .select("id")
      .maybeSingle();
    if (finalized) {
      await insertCeloPlatformFee(
        admin,
        pf,
        "player_phase_main",
        {
          roundId: round.id,
          idempotencyKey: `celo_fee_round_${round.id}_player_phase_main`,
        }
      );
      await delayBeforeRoomReset();
      const nextStatus = await nextRoomStatusAfterRoundComplete(admin, room.id);
      await admin
        .from("celo_rooms")
        .update({
          total_rounds: (room.total_rounds ?? 0) + 1,
          last_activity: now,
          status: nextStatus,
        })
        .eq("id", room.id);
      await resetCeloRoomEntries(admin, room.id);
      await runCeloSideBetSettlementAfterRoundComplete(
        admin,
        room.id,
        round.id,
        feePct
      );
      celoAccountingLog("player_phase_settlement_complete", {
        roundId: round.id,
      });
    } else {
      const { data: cur } = await admin
        .from("celo_rounds")
        .select("status")
        .eq("id", round.id)
        .maybeSingle();
      celoAccountingLog("player_phase_settlement_skip", {
        roundId: round.id,
        status: cur?.status,
      });
      celoAccountingAuditLog("settlement_finalize_skipped_already_complete", {
        path: "player_phase_complete_round",
        roundId: round.id,
        status: cur?.status,
      });
    }
    return { hasMore: false };
  }
  const staked = await getCeloStakedPlayersOrdered(admin, room.id);
  const next = staked[0];
  await admin
    .from("celo_rounds")
    .update({
      current_player_seat: next?.seat_number ?? null,
      roller_user_id: next?.user_id ?? null,
      player_roll_deadline_at: nextPlayerRollDeadlineIso(),
    })
    .eq("id", round.id);
  return { hasMore: true };
}

/** API-friendly roll payload (includes dice_1..3 for clients that do not read `dice` jsonb). */
export function buildCeloClientPlayerRoll(
  row: Record<string, unknown> | null,
  dice: [number, number, number],
  meta: {
    createdAt: string;
    userId: string;
    roomId: string;
    roundId: string;
  }
) {
  const d1 = dice[0];
  const d2 = dice[1];
  const d3 = dice[2];
  if (row) {
    return {
      ...row,
      dice_1: d1,
      dice_2: d2,
      dice_3: d3,
      roll_type: "player" as const,
    };
  }
  return {
    dice_1: d1,
    dice_2: d2,
    dice_3: d3,
    user_id: meta.userId,
    room_id: meta.roomId,
    round_id: meta.roundId,
    created_at: meta.createdAt,
    roll_type: "player_reroll" as const,
    outcome: "reroll" as const,
  };
}

export type ResolvePlayerRollTimeoutResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/**
 * Server-authoritative timeout forfeit: same settlement as POST timeout_forfeit.
 * Idempotent via existing roll row / round updates (duplicate inserts fail or prior roll wins).
 */
export async function resolvePlayerRollTimeout(
  admin: SupabaseClient,
  ctx: { room: CeloPlayerRollTimeoutRoom; round: CeloPlayerRollTimeoutRound; feePct: number }
): Promise<ResolvePlayerRollTimeoutResult> {
  const { room, round, feePct } = ctx;
  const now = new Date().toISOString();

  if (
    isRoomPauseBlockingActions(
      room as { paused_at?: string | null; pause_expires_at?: string | null }
    )
  ) {
    return { ok: false, status: 400, error: "Room is paused" };
  }

  const { data: fresh } = await admin
    .from("celo_rounds")
    .select("*")
    .eq("id", round.id)
    .maybeSingle();
  const r = (fresh as CeloPlayerRollTimeoutRound) ?? round;

  if (r.status !== "player_rolling") {
    return { ok: false, status: 400, error: "Round is not waiting for a player roll" };
  }
  if (r.roll_processing === true) {
    return { ok: false, status: 409, error: "A roll is in progress" };
  }
  const deadlineAt = r.player_roll_deadline_at
    ? new Date(String(r.player_roll_deadline_at)).getTime()
    : NaN;
  if (!Number.isFinite(deadlineAt)) {
    return { ok: false, status: 400, error: "Roll timer not available for this round yet" };
  }
  if (Date.now() < deadlineAt) {
    return { ok: false, status: 400, error: "Roll timer has not expired yet" };
  }

  const curSeat = r.current_player_seat;
  if (curSeat == null) {
    return { ok: false, status: 400, error: "No active player seat" };
  }

  const { data: players } = await admin
    .from("celo_room_players")
    .select("id, user_id, role, entry_sc, stake_amount_sc, bet_cents, entry_posted, seat_number")
    .eq("room_id", room.id);

  const active = (players ?? []).find((p) => {
    const row = p as CeloPlayerRollTimeoutPlayer;
    return (
      row.role === "player" &&
      row.entry_posted === true &&
      effectiveCeloStakeSc(row) > 0 &&
      (row.seat_number ?? 0) === curSeat
    );
  }) as CeloPlayerRollTimeoutPlayer | undefined;

  if (!active) {
    return { ok: false, status: 409, error: "No staked player at the current seat" };
  }

  const timedOutUserId = String(active.user_id);
  const entry = effectiveCeloStakeSc(active);

  const { data: priorFinal } = await admin
    .from("celo_player_rolls")
    .select("id")
    .eq("round_id", r.id)
    .eq("user_id", timedOutUserId)
    .in("outcome", ["win", "loss", "push"])
    .limit(1);
  if (priorFinal && priorFinal.length > 0) {
    return { ok: false, status: 400, error: "Player already resolved this round" };
  }

  const { net, fee } = celoStakeNetAndPlatformFee(entry);
  await celoAdjustRoomBank(admin, room.id, net);
  await celoApplyRoundBankerAccountingDelta(admin, r.id, net, fee);

  const timeoutDice = [2, 2, 1] as [number, number, number];
  const { data: ins, error: insErr } = await admin
    .from("celo_player_rolls")
    .insert({
      round_id: r.id,
      room_id: room.id,
      user_id: timedOutUserId,
      dice: timeoutDice,
      roll_name: "Roll deadline",
      roll_result: "instant_loss",
      point: null,
      entry_sc: entry,
      outcome: "loss",
      payout_sc: 0,
      platform_fee_sc: fee,
    })
    .select("*")
    .single();

  if (insErr || !ins) {
    return {
      ok: false,
      status: 500,
      error: insErr?.message ?? "Failed to record timeout forfeit",
    };
  }

  await admin
    .from("celo_room_players")
    .update({ entry_sc: 0, bet_cents: 0, stake_amount_sc: 0 })
    .eq("id", active.id);

  celoAccountingLog("player_roll_timeout_forfeit", {
    roundId: r.id,
    roomId: room.id,
    userId: timedOutUserId,
    entrySc: entry,
    platformFeeSc: fee,
    bankerNetToBankSc: net,
  });

  const adv = await finishOrAdvanceAfterPlayerResolvingRoll(admin, {
    room,
    round: r,
    feePct,
    now,
  });

  const { data: roundOut } = await admin
    .from("celo_rounds")
    .select("*")
    .eq("id", r.id)
    .maybeSingle();
  const { data: roomOut } = await admin
    .from("celo_rooms")
    .select("*")
    .eq("id", room.id)
    .maybeSingle();
  const { gpayCoins } = await getUserCoins(timedOutUserId);

  const clientRoll = buildCeloClientPlayerRoll(ins as Record<string, unknown>, timeoutDice, {
    createdAt: now,
    userId: timedOutUserId,
    roomId: room.id,
    roundId: r.id,
  });

  const roundPatched =
    roundOut == null
      ? null
      : { ...(roundOut as Record<string, unknown>), roll_processing: false };

  const roomOutSc = Math.max(
    0,
    Math.floor(
      Number(
        (roomOut as { current_bank_sc?: number } | null)?.current_bank_sc ??
          room.current_bank_sc ??
          0
      )
    )
  );

  const body: Record<string, unknown> = {
    ok: true,
    timeout_forfeit: true,
    roll: clientRoll,
    round: roundPatched,
    room: roomOut,
    currentRound: roundPatched,
    dice: timeoutDice,
    rollName: "Roll deadline",
    result: "instant_loss",
    point: null,
    outcome: "loss",
    payoutSc: 0,
    newBalance: gpayCoins,
    player_can_become_banker: false,
    player_must_have_sc: roomOutSc,
    isCelo: false,
    roundComplete: !adv.hasMore,
    banker_takeover_offered: false,
    player_user_id: timedOutUserId,
    bankStopped: false,
    oldBankerId: null,
    newBankerId: null,
    message:
      "Roll timer expired — stake forfeited. Platform fee is charged because the banker won the forfeited bet (same settlement as a normal loss).",
  };

  return { ok: true, body };
}
