import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_KEYS,
  type AchievementKey,
} from "@/lib/arena-achievements";

/** POST /api/arena/achievements/check — check and grant any newly earned achievements (idempotent). */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: fighter } = await supabase
    .from("arena_fighters")
    .select("id, wins, losses, training_sessions, win_streak")
    .eq("user_id", userId)
    .maybeSingle();
  if (!fighter) return NextResponse.json({ granted: [], message: "No fighter" });

  const fighterId = (fighter as { id: string }).id;
  const ctx = {
    wins: (fighter as { wins?: number }).wins ?? 0,
    losses: (fighter as { losses?: number }).losses ?? 0,
    training_sessions: (fighter as { training_sessions?: number }).training_sessions ?? 0,
    win_streak: (fighter as { win_streak?: number }).win_streak ?? 0,
  };

  const { data: existing } = await supabase.from("arena_achievements").select("achievement_key").eq("fighter_id", fighterId);
  const unlockedSet = new Set(((existing ?? []) as { achievement_key: string }[]).map((r) => r.achievement_key));

  const granted: { key: string; coins: number }[] = [];
  for (const key of ACHIEVEMENT_KEYS) {
    if (unlockedSet.has(key)) continue;
    const def = ACHIEVEMENT_DEFINITIONS[key as AchievementKey];
    if (!def.check(ctx)) continue;
    const { error: insErr } = await supabase.from("arena_achievements").insert({ fighter_id: fighterId, achievement_key: key });
    if (insErr) continue;
    const { data: u } = await supabase.from("users").select("arena_coins").eq("id", userId).single();
    const cur = Number((u as { arena_coins?: number })?.arena_coins ?? 0);
    await supabase.from("users").update({ arena_coins: cur + def.coins }).eq("id", userId);
    await supabase.from("arena_coin_transactions").insert({
      user_id: userId,
      amount: def.coins,
      type: "achievement",
      description: `Achievement: ${def.name}`,
    });
    granted.push({ key, coins: def.coins });
  }

  return NextResponse.json({ granted });
}
