import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry, getCanonicalBalanceCents } from "@/lib/wallet-ledger";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import {
  assertSumStakesWithinReserve,
  sumPlayerTableStakesCents,
  totalCommittedAfterStakeReplacement,
} from "@/lib/celo-banker-reserve";
import { celoQaLog } from "@/lib/celo-qa-log";

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

  const { room_id, round_id } = body as { room_id?: string; round_id?: string };
  if (!room_id || !round_id) {
    return NextResponse.json({ error: "room_id and round_id required" }, { status: 400 });
  }

  // Verify user is a player in this room
  const { data: playerRows } = await supabase
    .from("celo_room_players")
    .select("role, bet_cents, entry_sc")
    .eq("room_id", room_id)
    .eq("user_id", userId)
    .limit(1);

  const playerRow = celoFirstRow(playerRows);
  if (!playerRow || (playerRow as { role: string }).role !== "player") {
    return NextResponse.json({ error: "Not a player in this room" }, { status: 403 });
  }

  // Fetch round
  const { data: roundRows } = await supabase
    .from("celo_rounds")
    .select("*")
    .eq("id", round_id)
    .eq("room_id", room_id)
    .limit(1);

  const round = celoFirstRow(roundRows);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const roundRecord = round as {
    status: string;
    bank_covered: boolean;
    covered_by: string | null;
    prize_pool_sc: number;
  };

  if (!["betting", "banker_rolling"].includes(roundRecord.status)) {
    return NextResponse.json({ error: "Round is not in a bettable state" }, { status: 400 });
  }

  if (roundRecord.bank_covered) {
    return NextResponse.json({ error: "Bank already covered by another player" }, { status: 400 });
  }

  const { data: roomRows } = await supabase.from("celo_rooms").select("*").eq("id", room_id).limit(1);
  const room = celoFirstRow(roomRows);

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const roomRecord = normalizeCeloRoomRow(room as Record<string, unknown>) as {
    current_bank_cents: number;
    min_bet_cents: number;
    banker_id: string;
    banker_reserve_cents: number;
  };

  if (userId === roomRecord.banker_id) {
    return NextResponse.json({ error: "Banker cannot cover their own bank" }, { status: 400 });
  }

  const coverAmount = roomRecord.current_bank_cents;

  const { data: allPlayerStakes, error: stakesErr } = await supabase
    .from("celo_room_players")
    .select("bet_cents, entry_sc")
    .eq("room_id", room_id)
    .eq("role", "player");

  if (stakesErr) {
    console.error("[celo/cover-bank] stake load", stakesErr.message);
    return NextResponse.json({ error: "Could not validate table liability" }, { status: 500 });
  }

  const totalCommitted = sumPlayerTableStakesCents(
    (allPlayerStakes ?? []) as { bet_cents?: number | null; entry_sc?: number | null }[]
  );
  const previousStake = celoPlayerStakeCents(
    (playerRow ?? {}) as { bet_cents?: number | null; entry_sc?: number | null }
  );
  const nextTotal = totalCommittedAfterStakeReplacement({
    totalCommittedAllPlayers: totalCommitted,
    previousStakeThisPlayer: previousStake,
    newStakeThisPlayer: coverAmount,
  });

  const cap = assertSumStakesWithinReserve({
    reserveCents: roomRecord.banker_reserve_cents,
    sumStakesCents: nextTotal,
    messageWhenExceeded:
      "Covering the bank would exceed the banker reserved liability cap for this table.",
  });
  if (!cap.ok) {
    celoQaLog("cover_bank_reserve_rejected", {
      roomId: room_id,
      reserveCents: roomRecord.banker_reserve_cents,
      totalCommittedCents: totalCommitted,
      previousStakeCents: previousStake,
      coverAmountCents: coverAmount,
      nextTotalCommittedCents: nextTotal,
      httpStatus: 400,
    });
    console.error("[celo/cover-bank] reserve exceeded", {
      room_id,
      reserve: roomRecord.banker_reserve_cents,
      totalCommitted,
      previousStake,
      coverAmount,
      nextTotal,
    });
    return NextResponse.json({ error: cap.message }, { status: 400 });
  }

  // Check balance
  const balanceCents = await getCanonicalBalanceCents(userId);
  if (balanceCents < coverAmount) {
    return NextResponse.json(
      { error: `Insufficient balance to cover bank of ${coverAmount} cents` },
      { status: 400 }
    );
  }

  // Deduct the cover amount (additional to their join bet)
  const deductResult = await walletLedgerEntry(
    userId,
    "game_play",
    -coverAmount,
    `celo_cover_bank_${round_id}_${Date.now()}`
  );

  if (!deductResult.success) {
    return NextResponse.json(
      { error: deductResult.message ?? "Failed to deduct cover amount" },
      { status: 400 }
    );
  }

  // Update player's table stake (keep entry_sc in sync for settlement / sums)
  await supabase
    .from("celo_room_players")
    .update({ bet_cents: coverAmount, entry_sc: coverAmount })
    .eq("room_id", room_id)
    .eq("user_id", userId);

  // Mark round as bank_covered
  const { data: updatedRoundRows, error: updateErr } = await supabase
    .from("celo_rounds")
    .update({
      bank_covered: true,
      covered_by: userId,
      prize_pool_sc: coverAmount,
    })
    .eq("id", round_id)
    .select()
    .limit(1);

  const updatedRound = celoFirstRow(updatedRoundRows);
  if (updateErr) {
    await walletLedgerEntry(
      userId,
      "game_win",
      coverAmount,
      `celo_cover_refund_${round_id}_${Date.now()}`
    );
    return NextResponse.json({ error: "Failed to cover bank" }, { status: 500 });
  }

  await supabase.from("celo_audit_log").insert({
    room_id,
    round_id,
    user_id: userId,
    action: "bank_covered",
    details: { cover_amount: coverAmount },
  });

  return NextResponse.json({ round: updatedRound });
}
