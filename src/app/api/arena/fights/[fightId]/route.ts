import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/arena/fights/[fightId] — get one fight (for spectator watch page). */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ fightId: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { fightId } = await params;
  if (!fightId) {
    return NextResponse.json({ message: "fightId required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data: fight, error: fightErr } = await supabase
    .from("arena_fights")
    .select("id, fighter_a_id, fighter_b_id, winner_id, betting_open, fight_type, created_at")
    .eq("id", fightId)
    .single();
  if (fightErr || !fight) {
    return NextResponse.json({ message: "Fight not found" }, { status: 404 });
  }
  const { data: fighters } = await supabase
    .from("arena_fighters")
    .select("id, name, style, avatar, strength, speed, stamina, defense, chin, special")
    .in("id", [fight.fighter_a_id, fight.fighter_b_id]);
  const fa = fighters?.find((f) => f.id === fight.fighter_a_id);
  const fb = fighters?.find((f) => f.id === fight.fighter_b_id);
  return NextResponse.json({
    fight: {
      id: fight.id,
      fightType: fight.fight_type,
      bettingOpen: (fight as { betting_open?: boolean }).betting_open !== false,
      winnerId: (fight as { winner_id?: string }).winner_id ?? null,
      createdAt: (fight as { created_at?: string }).created_at,
    },
    fighterA: fa ?? null,
    fighterB: fb ?? null,
  });
}
