import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry, getCanonicalBalanceCents } from "@/lib/wallet-ledger";

// Side bet payout odds (multiplier on wager)
const SIDE_BET_ODDS: Record<string, number> = {
  celo: 8,
  shit: 8,
  hand_crack: 4.5,
  trips: 8,
  banker_wins: 1.8,
  player_wins: 1.8,
  specific_point: 6,
};

const MIN_SIDEBET_CENTS = 100;
const MAX_OPEN_BETS_PER_USER = 5;
// Side bets expire if not accepted within 5 minutes
const SIDEBET_EXPIRY_MS = 5 * 60 * 1000;

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

  const { room_id, round_id, bet_type, amount_cents, specific_point } = body as {
    room_id?: string;
    round_id?: string;
    bet_type?: string;
    amount_cents?: number;
    specific_point?: number;
  };

  if (!room_id || !round_id) {
    return NextResponse.json({ error: "room_id and round_id required" }, { status: 400 });
  }

  if (!bet_type || !(bet_type in SIDE_BET_ODDS)) {
    return NextResponse.json(
      {
        error: `bet_type must be one of: ${Object.keys(SIDE_BET_ODDS).join(", ")}`,
      },
      { status: 400 }
    );
  }

  if (bet_type === "specific_point") {
    if (
      typeof specific_point !== "number" ||
      specific_point < 2 ||
      specific_point > 5
    ) {
      return NextResponse.json(
        { error: "specific_point must be 2, 3, 4, or 5 for specific_point bets" },
        { status: 400 }
      );
    }
  }

  if (typeof amount_cents !== "number" || amount_cents < MIN_SIDEBET_CENTS) {
    return NextResponse.json(
      { error: `Minimum side bet is ${MIN_SIDEBET_CENTS} cents` },
      { status: 400 }
    );
  }

  // Verify user is in this room
  const { data: playerEntry } = await supabase
    .from("celo_room_players")
    .select("role")
    .eq("room_id", room_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!playerEntry) {
    return NextResponse.json({ error: "Not in this room" }, { status: 403 });
  }

  // Verify round exists and is active
  const { data: round } = await supabase
    .from("celo_rounds")
    .select("id, status")
    .eq("id", round_id)
    .eq("room_id", room_id)
    .maybeSingle();

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const rnd = round as { id: string; status: string };
  if (rnd.status === "completed") {
    return NextResponse.json({ error: "Round is already completed" }, { status: 400 });
  }

  // Enforce max open bets per user per round
  const { count: openBetCount } = await supabase
    .from("celo_side_bets")
    .select("id", { count: "exact", head: true })
    .eq("round_id", round_id)
    .eq("creator_id", userId)
    .eq("status", "open");

  if ((openBetCount ?? 0) >= MAX_OPEN_BETS_PER_USER) {
    return NextResponse.json(
      { error: `Maximum ${MAX_OPEN_BETS_PER_USER} open side bets per round` },
      { status: 400 }
    );
  }

  // Check balance
  const balanceCents = await getCanonicalBalanceCents(userId);
  if (balanceCents < amount_cents) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  // Deduct wager from creator
  const deductResult = await walletLedgerEntry(
    userId,
    "game_play",
    -amount_cents,
    `celo_sidebet_create_${round_id}_${Date.now()}`
  );

  if (!deductResult.success) {
    return NextResponse.json(
      { error: deductResult.message ?? "Failed to deduct bet amount" },
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + SIDEBET_EXPIRY_MS).toISOString();

  const { data: newBet, error: insertErr } = await supabase
    .from("celo_side_bets")
    .insert({
      room_id,
      round_id,
      creator_id: userId,
      bet_type,
      amount_cents,
      odds_multiplier: SIDE_BET_ODDS[bet_type],
      specific_point: bet_type === "specific_point" ? specific_point : null,
      status: "open",
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (insertErr || !newBet) {
    // Refund on failure
    await walletLedgerEntry(
      userId,
      "game_win",
      amount_cents,
      `celo_sidebet_refund_create_${round_id}_${Date.now()}`
    );
    return NextResponse.json({ error: "Failed to create side bet" }, { status: 500 });
  }

  await supabase.from("celo_audit_log").insert({
    room_id,
    round_id,
    user_id: userId,
    action: "sidebet_created",
    details: {
      bet_type,
      amount_cents,
      odds_multiplier: SIDE_BET_ODDS[bet_type],
      specific_point: specific_point ?? null,
    },
  });

  return NextResponse.json({ bet: newBet });
}
