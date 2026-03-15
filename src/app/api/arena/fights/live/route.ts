import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/arena/fights/live — list active fights (winner_id is null) for spectator lobby. */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data: fights, error: fightsErr } = await supabase
    .from("arena_fights")
    .select("id, fighter_a_id, fighter_b_id, fight_type, betting_open, created_at")
    .is("winner_id", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (fightsErr) {
    return NextResponse.json({ message: fightsErr.message }, { status: 500 });
  }
  if (!fights?.length) {
    return NextResponse.json({ fights: [] });
  }
  const fighterIds = Array.from(new Set(fights.flatMap((f) => [f.fighter_a_id, f.fighter_b_id])));
  const { data: fighters, error: fightersErr } = await supabase
    .from("arena_fighters")
    .select("id, name, style, avatar")
    .in("id", fighterIds);
  if (fightersErr || !fighters) {
    return NextResponse.json({ message: fightersErr?.message ?? "Failed to load fighters" }, { status: 500 });
  }
  const byId = new Map((fighters as { id: string }[]).map((f) => [f.id, f]));
  const list = fights.map((f) => ({
    id: f.id,
    fightType: f.fight_type,
    bettingOpen: (f as { betting_open?: boolean }).betting_open !== false,
    createdAt: (f as { created_at?: string }).created_at,
    fighterA: byId.get(f.fighter_a_id) ?? null,
    fighterB: byId.get(f.fighter_b_id) ?? null,
  }));
  return NextResponse.json({ fights: list });
}
