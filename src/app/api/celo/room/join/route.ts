import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry, getCanonicalBalanceCents } from "@/lib/wallet-ledger";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";

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
  const { data: room, error: roomErr } = await supabase
    .from("celo_rooms")
    .select("*")
    .eq("id", room_id)
    .single();

  if (roomErr || !room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const roomRecord = normalizeCeloRoomRow(room as Record<string, unknown>);
  if (!roomRecord) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (!roomRecord.status || !["waiting", "active"].includes(roomRecord.status)) {
    return NextResponse.json({ error: "Room is not open for joining" }, { status: 400 });
  }

  // Private room: validate join code
  if (roomRecord.room_type === "private") {
    if (!join_code || join_code.trim() !== String(roomRecord.join_code ?? "").trim()) {
      return NextResponse.json({ error: "Invalid join code" }, { status: 403 });
    }
  }

  // Check if user is already in this room
  const { data: existingPlayer } = await supabase
    .from("celo_room_players")
    .select("id")
    .eq("room_id", room_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingPlayer) {
    return NextResponse.json({ error: "Already in this room" }, { status: 400 });
  }

  let betCents = 0;
  let seatNumber: number | null = null;

  if (playerRole === "player") {
    if (!entry_cents || typeof entry_cents !== "number") {
      return NextResponse.json({ error: "entry_cents required for players" }, { status: 400 });
    }

    if (entry_cents < roomRecord.min_bet_cents) {
      return NextResponse.json(
        { error: `Entry must be at least ${roomRecord.min_bet_cents} cents` },
        { status: 400 }
      );
    }

    if (entry_cents % roomRecord.min_bet_cents !== 0) {
      return NextResponse.json(
        { error: `Entry must be a multiple of ${roomRecord.min_bet_cents} cents` },
        { status: 400 }
      );
    }

    if (entry_cents > roomRecord.max_bet_cents) {
      return NextResponse.json(
        { error: `Entry cannot exceed ${roomRecord.max_bet_cents} cents` },
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

    // Check balance
    const balanceCents = await getCanonicalBalanceCents(userId);
    if (balanceCents < entry_cents) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }

    // Deduct entry
    const deductResult = await walletLedgerEntry(
      userId,
      "game_play",
      -entry_cents,
      `celo_entry_${room_id}_${Date.now()}`
    );

    if (!deductResult.success) {
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

  // Insert player
  const { data: playerRow, error: insertErr } = await supabase
    .from("celo_room_players")
    .insert({
      room_id,
      user_id: userId,
      role: playerRole,
      bet_cents: betCents,
      seat_number: seatNumber,
    })
    .select()
    .single();

  if (insertErr || !playerRow) {
    if (playerRole === "player" && betCents > 0) {
      await walletLedgerEntry(
        userId,
        "game_win",
        betCents,
        `celo_entry_refund_${room_id}_${Date.now()}`
      );
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
