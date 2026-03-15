import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getTotalStats, getWeightClass } from "@/lib/arena-achievements";

/** GET /api/arena/me — current user's fighter (if any). */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data: fighter, error } = await supabase
    .from("arena_fighters")
    .select("id, name, style, avatar, title, strength, speed, stamina, defense, chin, special, wins, losses, condition, win_streak, training_sessions")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  let weightClass: string | null = null;
  let totalStats = 0;
  if (fighter) {
    totalStats = getTotalStats(fighter as Record<string, number>);
    weightClass = getWeightClass(totalStats);
  }
  return NextResponse.json({
    fighter: fighter ?? null,
    weightClass,
    totalStats,
  });
}
