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

  const { bet_id } = body as { bet_id?: string };
  if (!bet_id) {
    return NextResponse.json({ error: "bet_id required" }, { status: 400 });
  }

  // Fetch the side bet
  const { data: bet } = await supabase
    .from("celo_side_bets")
    .select("*")
    .eq("id", bet_id)
    .maybeSingle();

  if (!bet) {
    return NextResponse.json({ error: "Side bet not found" }, { status: 404 });
  }

  const b = bet as {
    id: string;
    room_id: string;
    round_id: string;
    creator_id: string;
    amount_cents: number;
    status: string;
    expires_at: string | null;
  };

  if (b.creator_id === userId) {
    return NextResponse.json({ error: "Cannot accept your own side bet" }, { status: 400 });
  }

  if (b.status !== "open") {
    return NextResponse.json(
      { error: "Side bet is no longer open for acceptance" },
      { status: 400 }
    );
  }

  if (b.expires_at && new Date(b.expires_at).getTime() < Date.now()) {
    // Expire the bet and refund creator
    await supabase
      .from("celo_side_bets")
      .update({ status: "expired", settled_at: new Date().toISOString() })
      .eq("id", bet_id);
    await walletLedgerEntry(
      b.creator_id,
      "game_win",
      b.amount_cents,
      `celo_sidebet_expired_${bet_id}`
    );
    return NextResponse.json({ error: "Side bet has expired" }, { status: 400 });
  }

  // Verify acceptor is in the room
  const { data: playerEntry } = await supabase
    .from("celo_room_players")
    .select("role")
    .eq("room_id", b.room_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!playerEntry) {
    return NextResponse.json({ error: "Not in this room" }, { status: 403 });
  }

  // Check acceptor balance
  const balanceCents = await getCanonicalBalanceCents(userId);
  if (balanceCents < b.amount_cents) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  // Deduct from acceptor
  const deductResult = await walletLedgerEntry(
    userId,
    "game_play",
    -b.amount_cents,
    `celo_sidebet_accept_${bet_id}_${Date.now()}`
  );

  if (!deductResult.success) {
    return NextResponse.json(
      { error: deductResult.message ?? "Failed to deduct bet amount" },
      { status: 400 }
    );
  }

  // Mark bet as matched
  const { data: updatedBet, error: updateErr } = await supabase
    .from("celo_side_bets")
    .update({
      acceptor_id: userId,
      status: "matched",
    })
    .eq("id", bet_id)
    .eq("status", "open") // Optimistic lock — prevent double-accept
    .select()
    .single();

  if (updateErr || !updatedBet) {
    // Someone else got there first — refund acceptor
    await walletLedgerEntry(
      userId,
      "game_win",
      b.amount_cents,
      `celo_sidebet_accept_refund_${bet_id}_${Date.now()}`
    );
    return NextResponse.json(
      { error: "Side bet was already accepted or is no longer available" },
      { status: 409 }
    );
  }

  await supabase.from("celo_audit_log").insert({
    room_id: b.room_id,
    round_id: b.round_id,
    user_id: userId,
    action: "sidebet_accepted",
    details: { bet_id, amount_cents: b.amount_cents },
  });

  return NextResponse.json({ bet: updatedBet });
}
