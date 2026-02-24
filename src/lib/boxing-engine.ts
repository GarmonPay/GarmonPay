/**
 * Real-time boxing fight engine. All logic server-side only.
 * Each tick: Punch, Block, Miss, or Critical hit. Health bars updated live.
 */

import { createAdminClient } from "@/lib/supabase";

export type FightLogEntry = {
  t: number;
  type: "punch" | "block" | "miss" | "critical";
  attacker: 1 | 2;
  target: 1 | 2;
  damage?: number;
  msg: string;
};

const MAX_HEALTH = 100;
const FIGHT_DURATION_SECONDS = 15;
const DAMAGE_PUNCH = 8;
const DAMAGE_CRITICAL = 18;
const LEVEL_WEIGHT = 0.02; // +2% win chance per level difference

function sb() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

/** Get level for a user (from boxing_profiles). Default 1. */
export async function getBoxerLevel(userId: string): Promise<number> {
  const { data } = await sb()
    .from("boxing_profiles")
    .select("level")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { level?: number } | null)?.level ?? 1;
}

/** Ensure boxing_profiles row exists; return level. */
export async function ensureBoxingProfile(userId: string): Promise<number> {
  const { data: existing } = await sb()
    .from("boxing_profiles")
    .select("level")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return (existing as { level: number }).level;
  await sb()
    .from("boxing_profiles")
    .insert({
      user_id: userId,
      level: 1,
      wins: 0,
      losses: 0,
      knockouts: 0,
      earnings: 0,
      updated_at: new Date().toISOString(),
    });
  return 1;
}

/** Run one fight tick. Returns new healths and log entry. Server-side only. */
export function runFightTick(
  second: number,
  health1: number,
  health2: number,
  level1: number,
  level2: number,
  seed: number
): { health1: number; health2: number; entry: FightLogEntry } {
  const r = (seed * (second + 1) * 9301 + 49297) % 233280;
  const rand = r / 233280;
  const attacker: 1 | 2 = second % 2 === 0 ? 1 : 2;
  const target: 1 | 2 = attacker === 1 ? 2 : 1;
  const levelAdvantage = attacker === 1 ? level1 - level2 : level2 - level1;
  const winBias = levelAdvantage * LEVEL_WEIGHT;
  const roll = rand + winBias;

  let type: "punch" | "block" | "miss" | "critical";
  let damage = 0;
  let msg: string;
  const p1Name = "Player1";
  const p2Name = "Player2";

  if (roll < 0.15) {
    type = "critical";
    damage = DAMAGE_CRITICAL;
    msg = `${attacker === 1 ? p1Name : p2Name} landed a CRITICAL hit on ${target === 1 ? p1Name : p2Name} for $${(damage * 0.27).toFixed(2)}!`;
  } else if (roll < 0.45) {
    type = "punch";
    damage = DAMAGE_PUNCH;
    msg = `${attacker === 1 ? p1Name : p2Name} hit ${target === 1 ? p1Name : p2Name} for $${(damage * 0.27).toFixed(2)}`;
  } else if (roll < 0.7) {
    type = "block";
    msg = `${target === 1 ? p1Name : p2Name} blocked ${attacker === 1 ? p1Name : p2Name}'s attack`;
  } else {
    type = "miss";
    msg = `${attacker === 1 ? p1Name : p2Name} missed`;
  }

  let newHealth1 = health1;
  let newHealth2 = health2;
  if (damage > 0) {
    if (target === 1) newHealth1 = Math.max(0, health1 - damage);
    else newHealth2 = Math.max(0, health2 - damage);
  }

  const entry: FightLogEntry = {
    t: second,
    type,
    attacker,
    target,
    ...(damage > 0 && { damage }),
    msg,
  };

  return {
    health1: newHealth1,
    health2: newHealth2,
    entry,
  };
}

export interface BoxingMatchLiveRow {
  id: string;
  player1_id: string;
  player2_id: string | null;
  entry_fee: number;
  player1_health: number;
  player2_health: number;
  fight_seconds_elapsed: number;
  fight_log: unknown;
  status: string;
  winner_id: string | null;
}

/** Run full 15-second fight: update DB each tick (Realtime broadcasts). No delay so request finishes quickly. */
export async function runLiveFight(matchId: string): Promise<string> {
  const client = sb();
  const { data: match, error: fetchErr } = await client
    .from("boxing_matches")
    .select("*")
    .eq("id", matchId)
    .eq("status", "live")
    .single();
  if (fetchErr || !match) throw new Error("Match not found or not live");
  const m = match as BoxingMatchLiveRow & { fight_log: FightLogEntry[] };
  const player1Id = m.player1_id;
  const player2Id = m.player2_id;
  if (!player2Id) throw new Error("No opponent");

  const level1 = await getBoxerLevel(player1Id);
  const level2 = await getBoxerLevel(player2Id);
  const seed = matchId.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);

  let health1 = m.player1_health ?? MAX_HEALTH;
  let health2 = m.player2_health ?? MAX_HEALTH;
  let log: FightLogEntry[] = Array.isArray(m.fight_log) ? [...m.fight_log] : [];

  for (let t = m.fight_seconds_elapsed ?? 0; t < FIGHT_DURATION_SECONDS; t++) {
    const { health1: h1, health2: h2, entry } = runFightTick(t, health1, health2, level1, level2, seed);
    health1 = h1;
    health2 = h2;
    log.push(entry);

    await client
      .from("boxing_matches")
      .update({
        player1_health: health1,
        player2_health: health2,
        fight_seconds_elapsed: t + 1,
        fight_log: log,
      })
      .eq("id", matchId);

    if (health1 <= 0 || health2 <= 0) break;
  }

  const winnerId = health1 <= 0 ? player2Id : health2 <= 0 ? player1Id : health1 >= health2 ? player1Id : player2Id;
  await client
    .from("boxing_matches")
    .update({
      status: "completed",
      winner_id: winnerId,
      player1_health: health1,
      player2_health: health2,
      fight_seconds_elapsed: log.length,
      fight_log: log,
    })
    .eq("id", matchId);

  return winnerId;
}
