import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";

const COST_BY_STAT: Record<string, number> = {
  speed: 100,
  power: 200,
  defense: 200,
  stamina: 180,
};

const DRILLS: Record<
  string,
  {
    cost: number;
    speed: number;
    power: number;
    defense: number;
    stamina: number;
    experience: number;
  }
> = {
  punching_bag: { cost: 150, speed: 0, power: 2, defense: 0, stamina: 1, experience: 12 },
  speed_bag: { cost: 120, speed: 2, power: 0, defense: 0, stamina: 1, experience: 10 },
  shadow_boxing: { cost: 100, speed: 1, power: 0, defense: 2, stamina: 1, experience: 9 },
  footwork_drills: { cost: 110, speed: 2, power: 0, defense: 1, stamina: 2, experience: 11 },
};

/** POST /api/training/upgrade — upgrade one stat by 1. Deducts from wallet, updates fighter. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { fighter_id?: string; stat?: string; drill?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fighterId = typeof body.fighter_id === "string" ? body.fighter_id.trim() : null;
  const stat = typeof body.stat === "string" ? body.stat.toLowerCase() : null;
  const drill = typeof body.drill === "string" ? body.drill.toLowerCase() : null;
  if (!fighterId || (!stat && !drill)) {
    return NextResponse.json(
      { error: "fighter_id and either stat or drill are required" },
      { status: 400 }
    );
  }
  if (stat && !(stat in COST_BY_STAT)) {
    return NextResponse.json(
      { error: "stat must be speed, power, defense, or stamina" },
      { status: 400 }
    );
  }
  if (drill && !(drill in DRILLS)) {
    return NextResponse.json(
      { error: "Invalid drill. Use punching_bag, speed_bag, shadow_boxing, or footwork_drills." },
      { status: 400 }
    );
  }

  const costCents = drill ? DRILLS[drill].cost : stat ? COST_BY_STAT[stat] : 0;

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: fighter, error: fetchErr } = await supabase
    .from("fighters")
    .select("id, user_id, speed, power, defense, stamina, experience")
    .eq("id", fighterId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr || !fighter) {
    return NextResponse.json({ error: "Fighter not found" }, { status: 404 });
  }

  const row = fighter as {
    speed: number;
    power: number;
    defense: number;
    stamina: number;
    experience: number;
  };
  const next = {
    speed: row.speed,
    power: row.power,
    defense: row.defense,
    stamina: row.stamina,
    experience: row.experience,
  };

  if (drill) {
    const cfg = DRILLS[drill];
    next.speed = Math.min(100, row.speed + cfg.speed);
    next.power = Math.min(100, row.power + cfg.power);
    next.defense = Math.min(100, row.defense + cfg.defense);
    next.stamina = Math.min(100, row.stamina + cfg.stamina);
    next.experience = Math.max(0, row.experience + cfg.experience);
  } else if (stat) {
    if (row[stat as "speed" | "power" | "defense" | "stamina"] >= 100) {
      return NextResponse.json(
        { error: `${stat[0].toUpperCase() + stat.slice(1)} already at maximum` },
        { status: 400 }
      );
    }
    next[stat as "speed" | "power" | "defense" | "stamina"] = Math.min(
      100,
      row[stat as "speed" | "power" | "defense" | "stamina"] + 1
    );
    next.experience = Math.max(0, row.experience + 3);
  }

  if (
    next.speed === row.speed &&
    next.power === row.power &&
    next.defense === row.defense &&
    next.stamina === row.stamina &&
    next.experience === row.experience
  ) {
    return NextResponse.json({ error: "No stat increase available" }, { status: 400 });
  }

  const balance = await getCanonicalBalanceCents(userId);
  if (balance < costCents) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
  }

  const ref = `training_${fighterId}_${drill ?? stat}_${Date.now()}`;
  const ledgerResult = await walletLedgerEntry(userId, "game_play", -costCents, ref);
  if (!ledgerResult.success) {
    return NextResponse.json({ error: ledgerResult.message }, { status: 400 });
  }

  const { data: updatedFighter, error: updateErr } = await supabase
    .from("fighters")
    .update({
      speed: next.speed,
      power: next.power,
      defense: next.defense,
      stamina: next.stamina,
      experience: next.experience,
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
    applied: drill ?? stat,
  });
}
