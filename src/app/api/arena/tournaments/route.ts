import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/arena/tournaments — list open and in_progress tournaments. */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data: tournaments, error } = await supabase
    .from("arena_tournaments")
    .select("id, name, tournament_type, entry_fee, entry_coin_fee, prize_pool, status, bracket, max_fighters, created_at")
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  const ids = (tournaments ?? []).map((t) => (t as { id: string }).id);
  if (ids.length === 0) {
    return NextResponse.json({ tournaments: [] });
  }
  const { data: entryCounts } = await supabase
    .from("arena_tournament_entries")
    .select("tournament_id")
    .in("tournament_id", ids);
  const countByT: Record<string, number> = {};
  (entryCounts ?? []).forEach((r) => {
    const tid = (r as { tournament_id: string }).tournament_id;
    countByT[tid] = (countByT[tid] ?? 0) + 1;
  });
  const list = (tournaments ?? []).map((t) => {
    const row = t as { id: string; name: string; tournament_type: string; entry_fee: number; entry_coin_fee: number; prize_pool: number; status: string; bracket: unknown; max_fighters: number; created_at: string };
    return {
      ...row,
      entryCount: countByT[row.id] ?? 0,
    };
  });
  return NextResponse.json({ tournaments: list });
}
