import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry, getCanonicalBalanceCents } from "@/lib/wallet-ledger";

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
  const { data: playerRow } = await supabase
    .from("celo_room_players")
    .select("role, bet_cents")
    .eq("room_id", room_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!playerRow || (playerRow as { role: string }).role !== "player") {
    return NextResponse.json({ error: "Not a player in this room" }, { status: 403 });
  }

  // Fetch round
  const { data: round } = await supabase
    .from("celo_rounds")
    .select("*")
    .eq("id", round_id)
    .eq("room_id", room_id)
    .maybeSingle();

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const roundRecord = round as {
    status: string;
    bank_covered: boolean;
    covered_by: string | null;
    total_pot_cents: number;
  };

  if (!["betting", "banker_rolling"].includes(roundRecord.status)) {
    return NextResponse.json({ error: "Round is not in a bettable state" }, { status: 400 });
  }

  if (roundRecord.bank_covered) {
    return NextResponse.json({ error: "Bank already covered by another player" }, { status: 400 });
  }

  // Fetch room for current bank amount
  const { data: room } = await supabase
    .from("celo_rooms")
    .select("current_bank_cents, min_bet_cents, banker_id")
    .eq("id", room_id)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const roomRecord = room as { current_bank_cents: number; min_bet_cents: number; banker_id: string };

  if (userId === roomRecord.banker_id) {
    return NextResponse.json({ error: "Banker cannot cover their own bank" }, { status: 400 });
  }

  const coverAmount = roomRecord.current_bank_cents;

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

  // Update player's bet_cents to the cover amount
  await supabase
    .from("celo_room_players")
    .update({ bet_cents: coverAmount })
    .eq("room_id", room_id)
    .eq("user_id", userId);

  // Mark round as bank_covered
  const { data: updatedRound, error: updateErr } = await supabase
    .from("celo_rounds")
    .update({
      bank_covered: true,
      covered_by: userId,
      total_pot_cents: coverAmount,
    })
    .eq("id", round_id)
    .select()
    .single();

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
