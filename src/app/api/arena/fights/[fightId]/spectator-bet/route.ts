import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";
import { ADMIN_CUT_PCT, computeOdds } from "@/lib/arena-economy";

/** POST /api/arena/fights/[fightId]/spectator-bet — place a spectator bet (before round 1). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ fightId: string }> }
) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { fightId } = await params;
  if (!fightId) {
    return NextResponse.json({ message: "fightId required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { amount?: number; betOn?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const amount = Number(body.amount);
  const betOn = body.betOn;
  if (!(amount >= 1) || !betOn || typeof betOn !== "string") {
    return NextResponse.json({ message: "amount (>= 1) and betOn (fighter id) required" }, { status: 400 });
  }

  const { data: fight, error: fightErr } = await supabase
    .from("arena_fights")
    .select("id, fighter_a_id, fighter_b_id, betting_open")
    .eq("id", fightId)
    .single();
  if (fightErr || !fight) {
    return NextResponse.json({ message: "Fight not found" }, { status: 404 });
  }
  if ((fight as { betting_open?: boolean }).betting_open !== true) {
    return NextResponse.json({ message: "Betting closed for this fight" }, { status: 400 });
  }
  if (betOn !== fight.fighter_a_id && betOn !== fight.fighter_b_id) {
    return NextResponse.json({ message: "betOn must be fighter_a or fighter_b of this fight" }, { status: 400 });
  }

  const { data: myFighter } = await supabase
    .from("arena_fighters")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (myFighter && (fight.fighter_a_id === myFighter.id || fight.fighter_b_id === myFighter.id)) {
    return NextResponse.json({ message: "Participants cannot place spectator bets on their own fight" }, { status: 400 });
  }

  const { data: fighters, error: fErr } = await supabase
    .from("arena_fighters")
    .select("id, strength, speed, stamina, defense, chin, special")
    .in("id", [fight.fighter_a_id, fight.fighter_b_id]);
  if (fErr || !fighters || fighters.length !== 2) {
    return NextResponse.json({ message: "Fighters not found" }, { status: 500 });
  }
  const fa = fighters.find((f) => f.id === fight.fighter_a_id);
  const fb = fighters.find((f) => f.id === fight.fighter_b_id);
  if (!fa || !fb) {
    return NextResponse.json({ message: "Fighters not found" }, { status: 500 });
  }
  const totalA = (fa.strength ?? 0) + (fa.speed ?? 0) + (fa.stamina ?? 0) + (fa.defense ?? 0) + (fa.chin ?? 0) + (fa.special ?? 0);
  const totalB = (fb.strength ?? 0) + (fb.speed ?? 0) + (fb.stamina ?? 0) + (fb.defense ?? 0) + (fb.chin ?? 0) + (fb.special ?? 0);
  const oddsOnA = computeOdds(totalA, totalB);
  const oddsOnB = computeOdds(totalB, totalA);
  const odds = betOn === fight.fighter_a_id ? oddsOnA : oddsOnB;

  const amountCents = Math.round(amount * 100);
  const balanceCents = await getCanonicalBalanceCents(userId);
  if (balanceCents < amountCents) {
    return NextResponse.json({ message: "Insufficient balance", requiredCents: amountCents }, { status: 400 });
  }

  const reference = `arena_spectator_bet_${fightId}_${userId}_${Date.now()}`;
  const ledger = await walletLedgerEntry(userId, "game_play", -amountCents, reference);
  if (!ledger.success) {
    return NextResponse.json({ message: ledger.message ?? "Payment failed" }, { status: 400 });
  }

  const { data: bet, error: betErr } = await supabase
    .from("arena_spectator_bets")
    .insert({
      user_id: userId,
      fight_id: fightId,
      amount,
      bet_on: betOn,
      odds,
    })
    .select("id")
    .single();
  if (betErr || !bet) {
    return NextResponse.json({ message: betErr?.message ?? "Failed to place bet" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    betId: (bet as { id: string }).id,
    amount,
    betOn,
    odds,
    balanceCents: ledger.balance_cents,
  });
}
