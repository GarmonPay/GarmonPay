import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/arena/tournaments/[id] — get one tournament with bracket and fighter names. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ message: "id required" }, { status: 400 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: t, error: tErr } = await supabase
    .from("arena_tournaments")
    .select("id, name, tournament_type, entry_fee, entry_coin_fee, prize_pool, status, bracket, max_fighters, created_at")
    .eq("id", id)
    .single();
  if (tErr || !t) return NextResponse.json({ message: "Tournament not found" }, { status: 404 });

  const { data: entries } = await supabase.from("arena_tournament_entries").select("fighter_id, seed").eq("tournament_id", id).order("seed");
  const bracket = (t as { bracket?: { rounds?: unknown[] } }).bracket || {};
  const fighterIds = new Set<string>();
  (entries ?? []).forEach((e: { fighter_id: string }) => fighterIds.add(e.fighter_id));
  const rounds = bracket.rounds || [];
  rounds.forEach((r: { matches?: Array<{ fighterAId?: string; fighterBId?: string; winnerId?: string }> }) => {
    (r.matches || []).forEach((m) => {
      if (m.fighterAId) fighterIds.add(m.fighterAId);
      if (m.fighterBId) fighterIds.add(m.fighterBId);
      if (m.winnerId) fighterIds.add(m.winnerId);
    });
  });
  const idList = Array.from(fighterIds);
  const { data: fighters } = idList.length > 0 ? await supabase.from("arena_fighters").select("id, name, avatar").in("id", idList) : { data: [] };
  const fightersById = Object.fromEntries(((fighters ?? []) as { id: string; name: string; avatar: string }[]).map((f) => [f.id, f]));

  return NextResponse.json({
    tournament: t,
    entries: entries ?? [],
    bracket,
    fightersById,
  });
}
