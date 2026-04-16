import type { SupabaseClient } from "@supabase/supabase-js";
import { celoFirstRow } from "@/lib/celo-first-row";
import { mergeCeloRoomUpdate, normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { celoPlayerStakeRefundReference } from "@/lib/celo-room-refund-refs";
import { creditGpayIdempotent } from "@/lib/coins";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { getEligibleStakedPlayers } from "@/lib/celo-eligible-players";
import { celoSameAuthUserId, resolveCurrentPlayerForSeat } from "@/lib/celo-room-rules";
import { settleCeloOpenSideBets } from "@/lib/celo-side-bets-settle";
import { finalizeCeloPlayerRollingRound } from "@/lib/celo-round-advance";
import { celoWalletCredit, insertCeloPlatformFee } from "@/lib/celo-payout-ledger";
import { broadcastCeloRoomEvent } from "@/lib/celo-roll-broadcast";
import { celoQaLog } from "@/lib/celo-qa-log";

const TURN_MS = 5 * 60 * 1000;

function isoToMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

async function lastPlayerPhaseActivityMs(
  admin: SupabaseClient,
  roundId: string,
  round: Record<string, unknown>
): Promise<number> {
  const { data: prRows } = await admin
    .from("celo_player_rolls")
    .select("created_at")
    .eq("round_id", roundId)
    .order("created_at", { ascending: false })
    .limit(1);

  const prRow = celoFirstRow(prRows) as { created_at?: string } | null;
  const prMs = isoToMs(prRow?.created_at);
  const animMs = isoToMs(round.roll_animation_start_at as string | undefined);
  const createdMs = isoToMs(round.created_at as string | undefined);
  return Math.max(prMs, animMs, createdMs);
}

async function handleBankerTurnTimeout(
  admin: SupabaseClient,
  roomId: string,
  roundId: string,
  round: Record<string, unknown>,
  now: string
): Promise<boolean> {
  const createdAt = String(round.created_at ?? "");
  const cutoffIso = new Date(Date.now() - TURN_MS).toISOString();
  if (createdAt >= cutoffIso) return false;

  const { data: roomRows } = await admin.from("celo_rooms").select("*").eq("id", roomId).limit(1);
  const roomRow = celoFirstRow(roomRows);
  if (!roomRow) return false;
  const rm = normalizeCeloRoomRow(roomRow as Record<string, unknown>);
  if (!rm) return false;

  await settleCeloOpenSideBets(admin, roundId, roomId);

  const { data: playerRows } = await admin
    .from("celo_room_players")
    .select("user_id, role, entry_sc, bet_cents")
    .eq("room_id", roomId);

  for (const p of (playerRows ?? []) as Array<{
    user_id: string;
    role: string;
    entry_sc?: number;
    bet_cents?: number;
  }>) {
    if (p.role !== "player") continue;
    const cents = celoPlayerStakeCents(p);
    if (cents <= 0) continue;
    const ref = celoPlayerStakeRefundReference(roomId, p.user_id);
    const result = await creditGpayIdempotent(
      p.user_id,
      cents,
      "C-Lo stake refund (banker turn timeout)",
      ref,
      "celo_refund"
    );
    if (!result.success) {
      throw new Error(`player refund ${p.user_id}: ${result.message}`);
    }
    await admin
      .from("celo_room_players")
      .update({ entry_sc: 0, bet_cents: 0 })
      .eq("room_id", roomId)
      .eq("user_id", p.user_id);
  }

  await admin
    .from("celo_rounds")
    .update({ status: "completed", completed_at: now })
    .eq("id", roundId);

  /* GarmonPay: banker stays until C-Lo; no auto banker rotation or room cancel. */
  await admin
    .from("celo_rooms")
    .update(
      mergeCeloRoomUpdate(rm.current_bank_cents, {
        status: "active",
        last_activity: now,
      })
    )
    .eq("id", roomId);

  await broadcastCeloRoomEvent(admin, roomId, "turn_timeout", {
    roomId,
    roundId,
    kind: "banker_stale",
    at: now,
  });

  await admin.from("celo_audit_log").insert({
    room_id: roomId,
    round_id: roundId,
    user_id: null,
    action: "banker_turn_timeout",
    details: { reason: "cron_5min_banker_no_roll", banker_rotated: false, room_cancelled: false },
  });

  celoQaLog("celo_banker_turn_timeout", { roomId, roundId, bankerRotated: false });
  return true;
}

async function handlePlayerTurnTimeout(
  admin: SupabaseClient,
  roomId: string,
  roundId: string,
  round: Record<string, unknown>,
  now: string
): Promise<boolean> {
  const lastMs = await lastPlayerPhaseActivityMs(admin, roundId, round);
  if (lastMs >= Date.now() - TURN_MS) return false;

  const coveredBy = (round.covered_by as string | null) ?? null;
  const currentSeat = round.current_player_seat as number | null;
  const bankerPoint = round.banker_point as number | null;
  if (bankerPoint == null) return false;

  const { data: roomRowsB } = await admin.from("celo_rooms").select("*").eq("id", roomId).limit(1);
  const roomRow = celoFirstRow(roomRowsB);
  if (!roomRow) return false;
  const rm = normalizeCeloRoomRow(roomRow as Record<string, unknown>);
  if (!rm) return false;

  const eligible = await getEligibleStakedPlayers(admin, roomId, coveredBy);
  let seat = currentSeat;
  if (seat == null) {
    seat = eligible[0]?.seat_number != null ? Number(eligible[0].seat_number) : 1;
    await admin.from("celo_rounds").update({ current_player_seat: seat }).eq("id", roundId);
  }

  const current = resolveCurrentPlayerForSeat(eligible, seat);
  if (!current) return false;

  const idx = eligible.findIndex((p) => celoSameAuthUserId(p.user_id, current.user_id));
  const next = idx >= 0 ? eligible[idx + 1] : null;

  const playerBet = current.bet_cents;
  const feePct = rm.platform_fee_pct;
  const bankerFee = Math.floor((playerBet * feePct) / 100);
  const bankerNet = playerBet - bankerFee;
  const forfeitUserId = current.user_id;

  const bankerIdStr = String(rm.banker_id ?? "");
  if (!bankerIdStr) {
    throw new Error("Room has no banker_id for player turn timeout");
  }

  const winRef = `celo_banker_turn_timeout_${roundId}_${forfeitUserId}_${Date.now()}`;
  const credit = await celoWalletCredit(admin, bankerIdStr, bankerNet, winRef);
  if (!credit.success) {
    throw new Error(`banker credit on forfeit: ${credit.message}`);
  }
  await insertCeloPlatformFee(admin, roundId, bankerFee, "turn_timeout");
  await admin
    .from("celo_rooms")
    .update(
      mergeCeloRoomUpdate(rm.current_bank_cents + bankerNet, {
        last_activity: now,
      })
    )
    .eq("id", roomId);

  await admin
    .from("celo_room_players")
    .update({ entry_sc: 0, bet_cents: 0 })
    .eq("room_id", roomId)
    .eq("user_id", forfeitUserId);

  if (!next) {
    await finalizeCeloPlayerRollingRound(admin, roomId, roundId, now);
  } else {
    await admin
      .from("celo_rounds")
      .update({ current_player_seat: next.seat_number ?? 1 })
      .eq("id", roundId);
  }

  await broadcastCeloRoomEvent(admin, roomId, "turn_timeout", {
    roomId,
    roundId,
    kind: "player_stale",
    forfeitUserId,
    at: now,
  });

  await admin.from("celo_audit_log").insert({
    room_id: roomId,
    round_id: roundId,
    user_id: null,
    action: "player_turn_timeout",
    details: {
      reason: "cron_5min_player_no_roll",
      forfeit_user_id: forfeitUserId,
      advanced_to: next?.user_id ?? null,
    },
  });

  celoQaLog("celo_player_turn_timeout", { roomId, roundId, forfeitUserId });
  return true;
}

/**
 * 5-minute turn timer for C-Lo: banker must roll within 5 minutes of round start;
 * current player must roll within 5 minutes of turn start (last roll / banker animation).
 */
export async function processCeloTurnTimeouts(admin: SupabaseClient): Promise<{
  bankerStale: number;
  playerStale: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let bankerStale = 0;
  let playerStale = 0;
  const now = new Date().toISOString();

  const { data: rounds, error: qErr } = await admin
    .from("celo_rounds")
    .select("*")
    .in("status", ["banker_rolling", "player_rolling"]);

  if (qErr) {
    return { bankerStale: 0, playerStale: 0, errors: [qErr.message] };
  }

  for (const raw of rounds ?? []) {
    const round = raw as Record<string, unknown>;
    const roundId = String(round.id ?? "");
    const roomId = String(round.room_id ?? "");
    if (!roundId || !roomId) continue;

    try {
      const status = String(round.status ?? "");
      if (status === "banker_rolling") {
        if (await handleBankerTurnTimeout(admin, roomId, roundId, round, now)) bankerStale += 1;
        continue;
      }
      if (status === "player_rolling") {
        if (await handlePlayerTurnTimeout(admin, roomId, roundId, round, now)) playerStale += 1;
      }
    } catch (e) {
      errors.push(`${roundId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { bankerStale, playerStale, errors };
}
