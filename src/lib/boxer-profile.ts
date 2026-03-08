/**
 * Boxing Career Mode: boxer profile (boxing_profiles) — get/create, update after fight.
 */

import { createAdminClient } from "@/lib/supabase";

export interface BoxerProfile {
  user_id: string;
  name: string | null;
  wins: number;
  losses: number;
  knockouts: number;
  power: number;
  speed: number;
  stamina: number;
  defense: number;
  chin: number;
  level: number;
  earnings: number;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_STAT = 50;

function sb() {
  const c = createAdminClient();
  if (!c) return null;
  return c;
}

/** Get boxer profile by user_id. Returns null if not found. */
export async function getBoxerProfile(userId: string): Promise<BoxerProfile | null> {
  const supabase = sb();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("boxing_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    user_id: String(r.user_id),
    name: r.name != null ? String(r.name) : null,
    wins: Number(r.wins) || 0,
    losses: Number(r.losses) || 0,
    knockouts: Number(r.knockouts) || 0,
    power: Number(r.power) || DEFAULT_STAT,
    speed: Number(r.speed) || DEFAULT_STAT,
    stamina: Number(r.stamina) || DEFAULT_STAT,
    defense: Number(r.defense) || DEFAULT_STAT,
    chin: Number(r.chin) || DEFAULT_STAT,
    level: Number(r.level) || 1,
    earnings: Number(r.earnings) || 0,
    created_at: r.created_at != null ? String(r.created_at) : undefined,
    updated_at: r.updated_at != null ? String(r.updated_at) : undefined,
  };
}

/** Get or create boxer profile. Creates with defaults if missing. */
export async function getOrCreateBoxerProfile(userId: string): Promise<BoxerProfile | null> {
  const existing = await getBoxerProfile(userId);
  if (existing) return existing;
  const supabase = sb();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("boxing_profiles")
    .insert({
      user_id: userId,
      level: 1,
      wins: 0,
      losses: 0,
      knockouts: 0,
      earnings: 0,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return getBoxerProfile(userId);
    return null;
  }
  return getBoxerProfile(userId);
}

/** Update boxer profile after a fight: winner gets wins (+ knockouts if KO), loser gets losses. */
export async function updateBoxerProfileAfterFight(
  winnerId: string,
  loserId: string,
  knockout: boolean
): Promise<void> {
  const [winnerProfile, loserProfile] = await Promise.all([
    getOrCreateBoxerProfile(winnerId),
    getOrCreateBoxerProfile(loserId),
  ]);
  const supabase = sb();
  if (!supabase || !winnerProfile || !loserProfile) return;
  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from("boxing_profiles")
      .update({
        wins: winnerProfile.wins + 1,
        knockouts: winnerProfile.knockouts + (knockout ? 1 : 0),
        updated_at: now,
      })
      .eq("user_id", winnerId),
    supabase
      .from("boxing_profiles")
      .update({
        losses: loserProfile.losses + 1,
        updated_at: now,
      })
      .eq("user_id", loserId),
  ]);
}

/** Update boxer profile after an AI fight (single player: won or lost). */
export async function updateBoxerProfileAfterAiFight(
  userId: string,
  won: boolean,
  knockout: boolean
): Promise<void> {
  const profile = await getOrCreateBoxerProfile(userId);
  const supabase = sb();
  if (!supabase || !profile) return;
  const now = new Date().toISOString();
  if (won) {
    await supabase
      .from("boxing_profiles")
      .update({
        wins: profile.wins + 1,
        knockouts: profile.knockouts + (knockout ? 1 : 0),
        updated_at: now,
      })
      .eq("user_id", userId);
  } else {
    await supabase
      .from("boxing_profiles")
      .update({
        losses: profile.losses + 1,
        updated_at: now,
      })
      .eq("user_id", userId);
  }
}
