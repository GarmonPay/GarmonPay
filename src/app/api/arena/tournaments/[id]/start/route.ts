import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { createEmptyBracket, adminCutFromTournament } from "@/lib/arena-tournaments";

/** POST /api/arena/tournaments/[id]/start — start tournament when full (8 entries). Creates bracket and first-round fights. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id: tournamentId } = await params;
  if (!tournamentId) {
    return NextResponse.json({ message: "id required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: tournament, error: tErr } = await supabase
    .from("arena_tournaments")
    .select("id, status, max_fighters, prize_pool")
    .eq("id", tournamentId)
    .single();
  if (tErr || !tournament) {
    return NextResponse.json({ message: "Tournament not found" }, { status: 404 });
  }
  if ((tournament as { status: string }).status !== "open") {
    return NextResponse.json({ message: "Tournament already started or complete" }, { status: 400 });
  }

  const { data: entries, error: eErr } = await supabase
    .from("arena_tournament_entries")
    .select("fighter_id")
    .eq("tournament_id", tournamentId)
    .order("seed");
  if (eErr || !entries || entries.length !== (tournament as { max_fighters: number }).max_fighters) {
    return NextResponse.json({ message: "Tournament is not full" }, { status: 400 });
  }

  const fighterIds = (entries as { fighter_id: string }[]).map((e) => e.fighter_id);
  const bracket = createEmptyBracket(fighterIds);
  const round0 = bracket.rounds[0];
  if (!round0 || round0.matches.length !== 4) {
    return NextResponse.json({ message: "Invalid bracket" }, { status: 500 });
  }

  const fightIds: string[] = [];
  for (const match of round0.matches) {
    const { data: fight, error: fErr } = await supabase
      .from("arena_fights")
      .insert({
        fighter_a_id: match.fighterAId,
        fighter_b_id: match.fighterBId,
        fight_type: "tournament",
      })
      .select("id")
      .single();
    if (fErr || !fight) {
      return NextResponse.json({ message: "Failed to create fight" }, { status: 500 });
    }
    fightIds.push((fight as { id: string }).id);
  }

  const roundsWithFightIds = [{
    matches: round0.matches.map((m, i) => ({ ...m, fightId: fightIds[i] })),
  }];
  const adminCut = adminCutFromTournament(Number((tournament as { prize_pool?: number }).prize_pool ?? 0));
  await supabase.from("arena_admin_earnings").insert({
    source_type: "tournament",
    source_id: tournamentId,
    amount: adminCut,
  });
  const { error: uErr } = await supabase
    .from("arena_tournaments")
    .update({
      status: "in_progress",
      bracket: { rounds: roundsWithFightIds, entryOrder: bracket.entryOrder },
      admin_cut: adminCut,
    })
    .eq("id", tournamentId);
  if (uErr) return NextResponse.json({ message: uErr.message }, { status: 500 });

  return NextResponse.json({ success: true, bracket: { rounds: roundsWithFightIds }, fightIds });
}
