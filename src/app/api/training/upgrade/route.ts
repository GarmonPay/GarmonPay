import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";

const COST_SPEED_CENTS = 100;
const COST_POWER_CENTS = 200;
const COST_DEFENSE_CENTS = 200;

/** POST /api/training/upgrade — upgrade one stat by 1. Deducts from wallet, updates fighter. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { fighter_id?: string; stat?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fighterId = typeof body.fighter_id === "string" ? body.fighter_id.trim() : null;
  const stat = typeof body.stat === "string" ? body.stat.toLowerCase() : null;
  if (!fighterId || !stat) {
    return NextResponse.json({ error: "fighter_id and stat required" }, { status: 400 });
  }
  if (!["speed", "power", "defense"].includes(stat)) {
    return NextResponse.json({ error: "stat must be speed, power, or defense" }, { status: 400 });
  }

  const costCents =
    stat === "speed" ? COST_SPEED_CENTS : stat === "power" ? COST_POWER_CENTS : COST_DEFENSE_CENTS;

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: fighter, error: fetchErr } = await supabase
    .from("fighters")
    .select("id, user_id, speed, power, defense")
    .eq("id", fighterId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr || !fighter) {
    return NextResponse.json({ error: "Fighter not found" }, { status: 404 });
  }

  const row = fighter as { speed: number; power: number; defense: number };
  if (stat === "speed" && row.speed >= 100) {
    return NextResponse.json({ error: "Speed already at maximum" }, { status: 400 });
  }
  if (stat === "power" && row.power >= 100) {
    return NextResponse.json({ error: "Power already at maximum" }, { status: 400 });
  }
  if (stat === "defense" && row.defense >= 100) {
    return NextResponse.json({ error: "Defense already at maximum" }, { status: 400 });
  }

  const balance = await getCanonicalBalanceCents(userId);
  if (balance < costCents) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  const ref = `training_${fighterId}_${stat}_${Date.now()}`;
  const ledgerResult = await walletLedgerEntry(userId, "game_play", -costCents, ref);
  if (!ledgerResult.success) {
    return NextResponse.json({ error: ledgerResult.message }, { status: 400 });
  }

  const { data: updatedFighter, error: updateErr } = await supabase
    .from("fighters")
    .update({
      [stat]: (row as Record<string, number>)[stat] + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fighterId)
    .eq("user_id", userId)
    .select()
    .single();

  if (updateErr || !updatedFighter) {
    return NextResponse.json({ error: "Failed to update fighter" }, { status: 500 });
  }

  return NextResponse.json({
    fighter: updatedFighter,
    balance_cents: ledgerResult.balance_cents,
  });
}
