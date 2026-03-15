import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_KEYS,
  getTotalStats,
  getWeightClass,
  type AchievementKey,
} from "@/lib/arena-achievements";

/** GET /api/arena/achievements — list definitions + current fighter's unlocked. */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: fighter } = await supabase
    .from("arena_fighters")
    .select("id, strength, speed, stamina, defense, chin, special, wins, losses, training_sessions, win_streak")
    .eq("user_id", userId)
    .maybeSingle();

  const totalStats = fighter ? getTotalStats(fighter as Record<string, number>) : 0;
  const weightClass = getWeightClass(totalStats);

  const { data: unlocked } = fighter
    ? await supabase.from("arena_achievements").select("achievement_key, unlocked_at").eq("fighter_id", (fighter as { id: string }).id)
    : { data: [] };
  const unlockedSet = new Set(((unlocked ?? []) as { achievement_key: string }[]).map((r) => r.achievement_key));

  const definitions = ACHIEVEMENT_KEYS.map((key) => ({
    key,
    name: ACHIEVEMENT_DEFINITIONS[key].name,
    coins: ACHIEVEMENT_DEFINITIONS[key].coins,
    unlocked: unlockedSet.has(key),
  }));

  return NextResponse.json({
    weightClass,
    totalStats,
    definitions,
    unlockedKeys: Array.from(unlockedSet),
  });
}
