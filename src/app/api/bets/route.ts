import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";

/** POST /api/bets — place a bet on a fight (body: { fight_id, amount_cents, prediction: 'host' | 'opponent' }). */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { fight_id?: string; amount_cents?: number; prediction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fightId = typeof body.fight_id === "string" ? body.fight_id.trim() : null;
  const amountCents = typeof body.amount_cents === "number" ? Math.round(body.amount_cents) : 0;
  const prediction = typeof body.prediction === "string" ? body.prediction.toLowerCase() : null;

  if (!fightId || amountCents < 100) {
    return NextResponse.json({ error: "fight_id and amount_cents (min 100) required" }, { status: 400 });
  }
  if (prediction !== "host" && prediction !== "opponent") {
    return NextResponse.json({ error: "prediction must be host or opponent" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: fight, error: fightErr } = await supabase
    .from("fights")
    .select("id, status, host_user_id, opponent_user_id")
    .eq("id", fightId)
    .maybeSingle();

  if (fightErr || !fight) {
    return NextResponse.json({ error: "Fight not found" }, { status: 404 });
  }
  const f = fight as { status: string; host_user_id: string; opponent_user_id: string | null };
  if (f.status !== "open" && f.status !== "active") {
    return NextResponse.json({ error: "Fight is not open for bets" }, { status: 400 });
  }
  if (f.host_user_id === userId || f.opponent_user_id === userId) {
    return NextResponse.json({ error: "Players cannot place spectator bets on their own fight" }, { status: 400 });
  }

  const balance = await getCanonicalBalanceCents(userId);
  if (balance < amountCents) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  const { data: existing } = await supabase.from("bets").select("id").eq("fight_id", fightId).eq("user_id", userId).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "You already have a bet on this fight" }, { status: 400 });
  }

  const ref = `bet_${fightId}_${userId}_${Date.now()}`;
  const ledgerResult = await walletLedgerEntry(userId, "game_play", -amountCents, ref);
  if (!ledgerResult.success) {
    return NextResponse.json({ error: ledgerResult.message }, { status: 400 });
  }

  const { data: bet, error: insertErr } = await supabase
    .from("bets")
    .insert({
      user_id: userId,
      fight_id: fightId,
      amount: amountCents,
      prediction,
      status: "pending",
    })
    .select()
    .single();

  if (insertErr || !bet) {
    return NextResponse.json({ error: "Failed to place bet" }, { status: 500 });
  }

  return NextResponse.json({ bet, balance_cents: ledgerResult.balance_cents });
}
