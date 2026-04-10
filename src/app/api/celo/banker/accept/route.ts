import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry, getCanonicalBalanceCents } from "@/lib/wallet-ledger";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";

// Player has 30 seconds after rolling C-Lo to become the banker
const ACCEPT_BANKER_WINDOW_MS = 30_000;

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

  // Verify the player is in this room with role "player"
  const { data: playerRows } = await supabase
    .from("celo_room_players")
    .select("role")
    .eq("room_id", room_id)
    .eq("user_id", userId)
    .limit(1);

  const playerEntry = celoFirstRow(playerRows);
  if (!playerEntry || (playerEntry as { role: string }).role !== "player") {
    return NextResponse.json({ error: "Not a player in this room" }, { status: 403 });
  }

  // Verify the player rolled C-Lo in this round
  const { data: celoRollRows } = await supabase
    .from("celo_player_rolls")
    .select("player_celo_at, created_at")
    .eq("round_id", round_id)
    .eq("user_id", userId)
    .eq("outcome", "win")
    .not("player_celo_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const celoRoll = celoFirstRow(celoRollRows);
  if (!celoRoll) {
    return NextResponse.json(
      { error: "You did not roll C-Lo in this round" },
      { status: 400 }
    );
  }

  const roll = celoRoll as { player_celo_at: string; created_at: string };
  const celoAt = new Date(roll.player_celo_at).getTime();

  if (Date.now() - celoAt > ACCEPT_BANKER_WINDOW_MS) {
    return NextResponse.json(
      { error: "Banker offer has expired (30 seconds)" },
      { status: 400 }
    );
  }

  const { data: roomRows } = await supabase.from("celo_rooms").select("*").eq("id", room_id).limit(1);
  const room = celoFirstRow(roomRows);

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rm = normalizeCeloRoomRow(room as Record<string, unknown>) as {
    banker_id: string;
    current_bank_cents: number;
    min_bet_cents: number;
    status: string;
  };

  if (rm.banker_id === userId) {
    return NextResponse.json({ error: "You are already the banker" }, { status: 400 });
  }

  const currentBankCents = rm.current_bank_cents;

  // Player stakes unchanged — banker_reserve_sc (liability cap) unchanged; this only moves bank float between users.

  // Check player has enough to cover the current bank
  const balanceCents = await getCanonicalBalanceCents(userId);
  if (balanceCents < currentBankCents) {
    return NextResponse.json(
      { error: `Insufficient balance to cover the current bank (${currentBankCents} cents)` },
      { status: 400 }
    );
  }

  // Deduct bank coverage from new banker
  const deductResult = await walletLedgerEntry(
    userId,
    "game_play",
    -currentBankCents,
    `celo_become_banker_${room_id}_${Date.now()}`
  );

  if (!deductResult.success) {
    return NextResponse.json(
      { error: deductResult.message ?? "Failed to deduct bank coverage" },
      { status: 400 }
    );
  }

  // Return current bank funds to old banker
  const refundResult = await walletLedgerEntry(
    rm.banker_id,
    "game_win",
    currentBankCents,
    `celo_banker_exit_${room_id}_${Date.now()}`
  );

  if (!refundResult.success) {
    // Roll back new banker deduction
    await walletLedgerEntry(
      userId,
      "game_win",
      currentBankCents,
      `celo_become_banker_refund_${room_id}_${Date.now()}`
    );
    return NextResponse.json({ error: "Failed to transfer bank funds" }, { status: 500 });
  }

  const now = new Date().toISOString();

  // Swap roles
  await Promise.all([
    supabase
      .from("celo_room_players")
      .update({ role: "player" })
      .eq("room_id", room_id)
      .eq("user_id", rm.banker_id),
    supabase
      .from("celo_room_players")
      .update({ role: "banker" })
      .eq("room_id", room_id)
      .eq("user_id", userId),
    supabase
      .from("celo_rooms")
      .update({
        banker_id: userId,
        last_activity: now,
        last_round_was_celo: false,
        banker_celo_at: null,
      })
      .eq("id", room_id),
  ]);

  await supabase.from("celo_audit_log").insert({
    room_id,
    round_id,
    user_id: userId,
    action: "banker_accepted",
    details: {
      new_banker_id: userId,
      previous_banker_id: rm.banker_id,
      bank_cents: currentBankCents,
    },
  });

  return NextResponse.json({
    new_banker_id: userId,
    previous_banker_id: rm.banker_id,
    bank_cents: currentBankCents,
  });
}
