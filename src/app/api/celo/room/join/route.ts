import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { getGPayBalance, deductGPay, creditGPay } from "@/lib/gpay-balance";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { isCeloRoomJoinableStatus } from "@/lib/celo-room-constants";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { assertSumStakesWithinReserve, sumPlayerTableStakesCents } from "@/lib/celo-banker-reserve";
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

  const {
    room_id,
    role,
    entry_cents,
    join_code,
  } = body as {
    room_id?: string;
    role?: string;
    entry_cents?: number;
    join_code?: string;
  };

  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const playerRole = role === "spectator" ? "spectator" : "player";

  // Fetch room
  const { data: roomRows, error: roomErr } = await supabase
    .from("celo_rooms")
    .select("*")
    .eq("id", room_id)
    .limit(1);

  const room = celoFirstRow(roomRows);
  if (roomErr || !room) {
    console.error("[celo/room/join] room not found", { room_id, err: roomErr?.message });
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const roomRecord = normalizeCeloRoomRow(room as Record<string, unknown>);
  if (!roomRecord) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (!isCeloRoomJoinableStatus(roomRecord.status)) {
    console.error("[celo/room/join] room not joinable", { room_id, status: roomRecord.status });
    return NextResponse.json({ error: "Room is not open for joining" }, { status: 400 });
  }

  // Private room: validate join code
  if (roomRecord.room_type === "private") {
    const want = String(join_code ?? "")
      .trim()
      .toUpperCase();
    const have = String(roomRecord.join_code ?? "")
      .trim()
      .toUpperCase();
    if (!want || want !== have) {
      console.error("[celo/room/join] invalid join code", { room_id });
      return NextResponse.json({ error: "Invalid join code" }, { status: 403 });
    }
  }

  // Check if user is already in this room
  const { data: existingRows } = await supabase
    .from("celo_room_players")
    .select("id")
    .eq("room_id", room_id)
    .eq("user_id", userId)
    .limit(1);

  if (celoFirstRow(existingRows)) {
    return NextResponse.json({ error: "Already in this room" }, { status: 400 });
  }

  let betCents = 0;
  let seatNumber: number | null = null;

  if (playerRole === "player") {
    if (!entry_cents || typeof entry_cents !== "number") {
      return NextResponse.json({ error: "entry_cents required for players" }, { status: 400 });
    }

    const MIN_ENTRY_SC = 500;
    if (entry_cents < MIN_ENTRY_SC) {
      return NextResponse.json(
        { error: `Entry must be at least ${MIN_ENTRY_SC} GPC ($5.00 minimum)` },
        { status: 400 }
      );
    }

    if (entry_cents < roomRecord.min_bet_cents) {
      return NextResponse.json(
        { error: `Entry must be at least ${roomRecord.min_bet_cents} GPC (table minimum)` },
        { status: 400 }
      );
    }

    if (entry_cents % roomRecord.min_bet_cents !== 0) {
      return NextResponse.json(
        { error: `Entry must be a whole multiple of ${roomRecord.min_bet_cents} GPC (minimum entry for this table)` },
        { status: 400 }
      );
    }

    if (entry_cents > roomRecord.max_bet_cents) {
      return NextResponse.json(
        { error: `Entry cannot exceed ${roomRecord.max_bet_cents} GPC` },
        { status: 400 }
      );
    }

    // Count current players
    const { count: playerCount } = await supabase
      .from("celo_room_players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", room_id)
      .eq("role", "player");

    if ((playerCount ?? 0) >= roomRecord.max_players) {
      return NextResponse.json({ error: "Room is full" }, { status: 400 });
    }

    const { data: stakeRows, error: stakeErr } = await supabase
      .from("celo_room_players")
      .select("bet_cents, entry_sc")
      .eq("room_id", room_id)
      .eq("role", "player");

    if (stakeErr) {
      console.error("[celo/room/join] stake sum failed", stakeErr.message);
      return NextResponse.json({ error: "Could not validate table liability" }, { status: 500 });
    }

    const totalCommitted = sumPlayerTableStakesCents(
      (stakeRows ?? []) as { bet_cents?: number | null; entry_sc?: number | null }[]
    );

    const reserve = roomRecord.banker_reserve_cents;
    const cap = assertSumStakesWithinReserve({
      reserveCents: reserve,
      sumStakesCents: totalCommitted + entry_cents,
      messageWhenExceeded:
        "Your entry cannot exceed the banker's remaining coverage for this table (total player entries cannot exceed the reserved bank).",
    });
    if (!cap.ok) {
      celoQaLog("join_reserve_rejected", {
        roomId: room_id,
        totalCommittedCents: totalCommitted,
        entryCents: entry_cents,
        reserveCents: reserve,
        httpStatus: 400,
      });
      console.error("[celo/room/join] over banker reserve", {
        room_id,
        totalCommitted,
        entry_cents,
        reserve,
      });
      return NextResponse.json({ error: cap.message }, { status: 400 });
    }

    const balanceGpay = await getGPayBalance(userId);
    if (balanceGpay < entry_cents) {
      celoQaLog("join_gpay_rejected", {
        roomId: room_id,
        balanceGpay,
        entryCents: entry_cents,
        httpStatus: 400,
      });
      console.error("[celo/room/join] insufficient $GPAY", { userId, balanceGpay, entry_cents });
      return NextResponse.json({ error: "Insufficient $GPAY balance" }, { status: 400 });
    }

    const deductResult = await deductGPay(userId, entry_cents, balanceGpay, {
      description: "C-Lo table entry",
      reference: `celo_entry_${room_id}_${Date.now()}`,
    });

    if (!deductResult.ok) {
      return NextResponse.json(
        { error: deductResult.message ?? "Failed to deduct entry" },
        { status: 400 }
      );
    }

    betCents = entry_cents;

    // Find next available seat number
    const { data: existingSeats } = await supabase
      .from("celo_room_players")
      .select("seat_number")
      .eq("room_id", room_id)
      .order("seat_number", { ascending: true });

    const usedSeats = new Set(
      (existingSeats ?? []).map((r: { seat_number: number | null }) => r.seat_number)
    );
    for (let i = 1; i <= roomRecord.max_players; i++) {
      if (!usedSeats.has(i)) {
        seatNumber = i;
        break;
      }
    }
  }

  // Insert player — persist stake in both columns for players (spectators: 0)
  const { data: insertedRows, error: insertErr } = await supabase
    .from("celo_room_players")
    .insert({
      room_id,
      user_id: userId,
      role: playerRole,
      bet_cents: betCents,
      entry_sc: playerRole === "player" ? betCents : 0,
      seat_number: seatNumber,
    })
    .select()
    .limit(1);

  const playerRow = celoFirstRow(insertedRows);
  if (insertErr || !playerRow) {
    if (playerRole === "player" && betCents > 0) {
      await creditGPay(userId, betCents, {
        description: "C-Lo entry refund",
        reference: `celo_entry_refund_${room_id}_${Date.now()}`,
      });
    }
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 });
  }

  // If room was waiting and this is the first player, mark it active
  if (roomRecord.status === "waiting" && playerRole === "player") {
    await supabase
      .from("celo_rooms")
      .update({ status: "active", last_activity: new Date().toISOString() })
      .eq("id", room_id)
      .eq("status", "waiting");
  }

  await supabase.from("celo_audit_log").insert({
    room_id,
    user_id: userId,
    action: "player_joined",
    details: { role: playerRole, bet_cents: betCents, seat_number: seatNumber },
  });

  // Return room + updated player list
  const { data: players } = await supabase
    .from("celo_room_players")
    .select("*")
    .eq("room_id", room_id);

  return NextResponse.json({ player: playerRow, players: players ?? [] });
}
