import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";
import {
  getSessionByKey,
  randomGain,
  STAT_CAP,
  checkSignatureUnlocks,
  type SignatureMoveKey,
} from "@/lib/arena-training";
import { arenaRateLimitTrain, getClientIpArena } from "@/lib/arena-security";

/** POST /api/arena/train — run one training session. Real wallet deduction, stat cap 99, signature unlock notifications. Rate limited. */
export async function POST(req: Request) {
  const rate = arenaRateLimitTrain(req);
  if (rate) return rate;
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const ip = getClientIpArena(req);

  let body: { sessionKey?: string; fingerprint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const sessionKey = body.sessionKey;
  try {
    await supabase.from("arena_activity_log").insert({ user_id: userId, ip, action_type: "train", fingerprint_hash: body.fingerprint || null });
  } catch {
    // ignore
  }
  if (!sessionKey || typeof sessionKey !== "string") {
    return NextResponse.json({ message: "sessionKey required" }, { status: 400 });
  }

  const config = getSessionByKey(sessionKey);
  if (!config) {
    return NextResponse.json({ message: "Unknown session" }, { status: 400 });
  }

  const { data: fighter, error: fighterError } = await supabase
    .from("arena_fighters")
    .select("id, strength, speed, stamina, defense, chin, special, training_sessions")
    .eq("user_id", userId)
    .maybeSingle();
  if (fighterError || !fighter) {
    return NextResponse.json({ message: "Fighter not found" }, { status: 404 });
  }

  if (fighter.training_sessions < config.requiredSessions) {
    return NextResponse.json(
      { message: `Complete ${config.requiredSessions} training sessions first to unlock ${config.name}` },
      { status: 400 }
    );
  }

  const currentStat = fighter[config.stat] as number;
  if (currentStat >= STAT_CAP) {
    return NextResponse.json(
      { message: `${config.stat} is already at max (${STAT_CAP})` },
      { status: 400 }
    );
  }

  const balanceCents = await getCanonicalBalanceCents(userId);
  if (balanceCents < config.priceCents) {
    return NextResponse.json(
      { message: "Insufficient balance", requiredCents: config.priceCents },
      { status: 400 }
    );
  }

  const reference = `arena_train_${fighter.id}_${sessionKey}_${Date.now()}`;
  const ledger = await walletLedgerEntry(userId, "game_play", -config.priceCents, reference);
  if (!ledger.success) {
    return NextResponse.json({ message: ledger.message ?? "Payment failed" }, { status: 400 });
  }

  const gain = randomGain(config.minGain, config.maxGain);
  const newValue = Math.min(STAT_CAP, currentStat + gain);
  const updates: Record<string, number> = {
    [config.stat]: newValue,
    training_sessions: fighter.training_sessions + 1,
    updated_at: Date.now() / 1000,
  };

  const { error: updateError } = await supabase
    .from("arena_fighters")
    .update({
      [config.stat]: newValue,
      training_sessions: fighter.training_sessions + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fighter.id);
  if (updateError) {
    return NextResponse.json({ message: "Failed to update fighter" }, { status: 500 });
  }

  const statsBefore = {
    strength: fighter.strength,
    speed: fighter.speed,
    stamina: fighter.stamina,
    defense: fighter.defense,
    chin: fighter.chin,
    special: fighter.special,
  };
  const statsAfter = { ...statsBefore, [config.stat]: newValue };
  const unlockedBefore = checkSignatureUnlocks(statsBefore);
  const unlockedAfter = checkSignatureUnlocks(statsAfter);
  const newlyUnlocked = (unlockedAfter as SignatureMoveKey[]).filter((k) => !unlockedBefore.includes(k));

  await supabase.from("arena_admin_earnings").insert({
    source_type: "store",
    source_id: fighter.id,
    amount: config.priceCents / 100,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    stat: config.stat,
    gain,
    newValue,
    trainingSessions: fighter.training_sessions + 1,
    unlockedMoves: newlyUnlocked,
    balanceCents: ledger.balance_cents,
  });
}
