import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry, getCanonicalBalanceCents } from "@/lib/wallet-ledger";

// Max players allowed by the celo_rooms table constraint (see celo_max_players_10 migration)
const ALLOWED_MAX_PLAYERS = [2, 4, 6, 10] as const;

type PgError = { message: string; code?: string; details?: string | null; hint?: string | null };

function jsonDbError(
  label: string,
  err: PgError | null | undefined,
  status = 500
): NextResponse {
  console.error(`[celo/room/create] ${label}:`, err);
  return NextResponse.json(
    {
      error: "Failed to create room",
      details: err?.message ?? "Unknown database error",
      code: err?.code ?? null,
    },
    { status }
  );
}
// Minimum bank bet: $5
const MIN_BET_CENTS = 500;

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
    name,
    room_type,
    max_players,
    minimum_entry_cents,
    starting_bank_cents,
    join_code,
    speed,
  } = body as {
    name?: string;
    room_type?: string;
    max_players?: number;
    minimum_entry_cents?: number;
    starting_bank_cents?: number;
    join_code?: string;
    speed?: string;
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Room name is required" }, { status: 400 });
  }

  if (!ALLOWED_MAX_PLAYERS.includes(max_players as (typeof ALLOWED_MAX_PLAYERS)[number])) {
    return NextResponse.json(
      { error: "Max players must be 2, 4, 6, or 10" },
      { status: 400 }
    );
  }

  if (!minimum_entry_cents || minimum_entry_cents < MIN_BET_CENTS) {
    return NextResponse.json(
      { error: `Minimum entry must be at least ${MIN_BET_CENTS} cents ($5)` },
      { status: 400 }
    );
  }

  if (minimum_entry_cents % MIN_BET_CENTS !== 0) {
    return NextResponse.json(
      { error: "Minimum entry must be a multiple of 500 cents ($5)" },
      { status: 400 }
    );
  }

  if (!starting_bank_cents || starting_bank_cents < minimum_entry_cents) {
    return NextResponse.json(
      { error: "Starting bank must be at least the minimum entry" },
      { status: 400 }
    );
  }

  if (room_type === "private" && (!join_code || typeof join_code !== "string" || join_code.trim().length === 0)) {
    return NextResponse.json(
      { error: "Private rooms require a join code" },
      { status: 400 }
    );
  }

  // Check banker has sufficient balance
  const balanceCents = await getCanonicalBalanceCents(userId);
  if (balanceCents < starting_bank_cents) {
    return NextResponse.json(
      { error: "Insufficient balance to cover the starting bank" },
      { status: 400 }
    );
  }

  // Deduct starting bank from banker via ledger
  const deductResult = await walletLedgerEntry(
    userId,
    "game_play",
    -starting_bank_cents,
    `celo_bank_deposit_${Date.now()}`
  );

  if (!deductResult.success) {
    console.error("[celo/room/create] walletLedgerEntry (deduct):", deductResult.message);
    return NextResponse.json(
      {
        error: deductResult.message ?? "Failed to reserve bank funds",
        details: deductResult.message,
        code: null,
      },
      { status: 400 }
    );
  }

  // Create the room (service role bypasses RLS; failures here are schema/constraints/FK)
  const { data: room, error: roomError } = await supabase
    .from("celo_rooms")
    .insert({
      name: name.trim(),
      creator_id: userId,
      banker_id: userId,
      room_type: room_type === "private" ? "private" : "public",
      max_players: max_players as number,
      min_bet_cents: minimum_entry_cents,
      max_bet_cents: Math.max(minimum_entry_cents * 10, starting_bank_cents),
      current_bank_cents: starting_bank_cents,
      speed: ["regular", "fast", "blitz"].includes(speed ?? "") ? speed : "regular",
      join_code: room_type === "private" ? join_code!.trim() : null,
      status: "waiting",
    })
    .select()
    .single();

  if (roomError) {
    console.error("Exact error:", roomError);
    const refund = await walletLedgerEntry(
      userId,
      "game_win",
      starting_bank_cents,
      `celo_bank_refund_creation_failed_${Date.now()}`
    );
    if (!refund.success) {
      console.error("[celo/room/create] refund after failed insert:", refund.message);
    }
    return jsonDbError("celo_rooms insert", roomError as PgError);
  }

  if (!room) {
    console.error("Exact error: insert returned no row");
    await walletLedgerEntry(
      userId,
      "game_win",
      starting_bank_cents,
      `celo_bank_refund_creation_failed_${Date.now()}`
    );
    return NextResponse.json(
      {
        error: "Failed to create room",
        details: "Insert succeeded but no row returned",
        code: null,
      },
      { status: 500 }
    );
  }

  const { error: playerError } = await supabase.from("celo_room_players").insert({
    room_id: room.id,
    user_id: userId,
    role: "banker",
    bet_cents: 0,
    seat_number: 0,
  });

  if (playerError) {
    console.error("Exact error:", playerError);
    await supabase.from("celo_rooms").delete().eq("id", room.id);
    const refund = await walletLedgerEntry(
      userId,
      "game_win",
      starting_bank_cents,
      `celo_bank_refund_player_insert_failed_${Date.now()}`
    );
    if (!refund.success) {
      console.error("[celo/room/create] refund after player insert failed:", refund.message);
    }
    return jsonDbError("celo_room_players insert", playerError as PgError);
  }

  const { error: auditError } = await supabase.from("celo_audit_log").insert({
    room_id: room.id,
    user_id: userId,
    action: "room_created",
    details: {
      name: room.name,
      max_players,
      minimum_entry_cents,
      starting_bank_cents,
      room_type: room.room_type,
    },
  });

  if (auditError) {
    console.error("Exact error:", auditError);
    await supabase.from("celo_room_players").delete().eq("room_id", room.id);
    await supabase.from("celo_rooms").delete().eq("id", room.id);
    const refund = await walletLedgerEntry(
      userId,
      "game_win",
      starting_bank_cents,
      `celo_bank_refund_audit_failed_${Date.now()}`
    );
    if (!refund.success) {
      console.error("[celo/room/create] refund after audit failed:", refund.message);
    }
    return jsonDbError("celo_audit_log insert", auditError as PgError);
  }

  return NextResponse.json({ room });
}
