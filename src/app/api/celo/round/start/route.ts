import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
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

  const { room_id } = body as { room_id?: string };
  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const { data: room } = await supabase.from("celo_rooms").select("*").eq("id", room_id).single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const roomRecord = normalizeCeloRoomRow(room as Record<string, unknown>) as {
    id: string;
    status: string;
    banker_id: string;
    platform_fee_pct: number;
    current_bank_cents: number;
  };

  // Only the banker may start a round
  if (roomRecord.banker_id !== userId) {
    return NextResponse.json({ error: "Only the banker can start a round" }, { status: 403 });
  }

  if (roomRecord.status !== "active") {
    return NextResponse.json({ error: "Room is not active" }, { status: 400 });
  }

  // Ensure no round is currently in progress
  const { data: inProgressRound } = await supabase
    .from("celo_rounds")
    .select("id, status")
    .eq("room_id", room_id)
    .neq("status", "completed")
    .maybeSingle();

  if (inProgressRound) {
    return NextResponse.json({ error: "A round is already in progress" }, { status: 400 });
  }

  // Get all players with bets
  const { data: players } = await supabase
    .from("celo_room_players")
    .select("user_id, bet_cents, role")
    .eq("room_id", room_id)
    .eq("role", "player")
    .gt("bet_cents", 0);

  if (!players || players.length === 0) {
    return NextResponse.json(
      { error: "At least one player with an entry is required to start a round" },
      { status: 400 }
    );
  }

  // Calculate prize pool
  const totalPotCents = (players as { bet_cents: number }[]).reduce(
    (sum, p) => sum + p.bet_cents,
    0
  );
  const platformFeeCents = Math.floor(
    (totalPotCents * roomRecord.platform_fee_pct) / 100
  );

  // Get next round number
  const { count: roundCount } = await supabase
    .from("celo_rounds")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room_id);

  const roundNumber = (roundCount ?? 0) + 1;

  // Insert new round
  const { data: newRound, error: roundErr } = await supabase
    .from("celo_rounds")
    .insert({
      room_id,
      round_number: roundNumber,
      banker_id: roomRecord.banker_id,
      status: "banker_rolling",
      prize_pool_sc: totalPotCents,
      platform_fee_sc: platformFeeCents,
    })
    .select()
    .single();

  if (roundErr || !newRound) {
    return NextResponse.json({ error: "Failed to start round" }, { status: 500 });
  }

  // Update room status
  await supabase
    .from("celo_rooms")
    .update({ status: "rolling", last_activity: new Date().toISOString(), last_round_was_celo: false })
    .eq("id", room_id);

  await supabase.from("celo_audit_log").insert({
    room_id,
    round_id: (newRound as { id: string }).id,
    user_id: userId,
    action: "round_started",
    details: {
      round_number: roundNumber,
      total_pot_cents: totalPotCents,
      platform_fee_cents: platformFeeCents,
      player_count: players.length,
    },
  });

  return NextResponse.json({ round: newRound });
}
