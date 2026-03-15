import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";
import { getSeasonPassActive } from "@/lib/arena-season-pass";

/** POST /api/arena/tournaments/[id]/join — join tournament (pay entry_fee or entry_coin_fee). */
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
    return NextResponse.json({ message: "tournament id required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: tournament, error: tErr } = await supabase
    .from("arena_tournaments")
    .select("id, name, entry_fee, entry_coin_fee, status, max_fighters")
    .eq("id", tournamentId)
    .single();
  if (tErr || !tournament) {
    return NextResponse.json({ message: "Tournament not found" }, { status: 404 });
  }
  if ((tournament as { status: string }).status !== "open") {
    return NextResponse.json({ message: "Tournament is not open for entry" }, { status: 400 });
  }

  const { data: fighter, error: fErr } = await supabase
    .from("arena_fighters")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (fErr || !fighter) {
    return NextResponse.json({ message: "Fighter not found" }, { status: 404 });
  }
  const fighterId = (fighter as { id: string }).id;

  const { data: existing } = await supabase
    .from("arena_tournament_entries")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("fighter_id", fighterId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ message: "Already entered" }, { status: 400 });
  }

  const { data: entries } = await supabase
    .from("arena_tournament_entries")
    .select("id")
    .eq("tournament_id", tournamentId);
  const count = (entries ?? []).length;
  if (count >= (tournament as { max_fighters: number }).max_fighters) {
    return NextResponse.json({ message: "Tournament is full" }, { status: 400 });
  }

  const entryCoinFee = Number((tournament as { entry_coin_fee?: number }).entry_coin_fee ?? 0);
  const entryFeeDollars = Number((tournament as { entry_fee?: number }).entry_fee ?? 0);
  const tournamentType = (tournament as { tournament_type?: string }).tournament_type ?? "weekly";
  const vipFreeWithSeasonPass = tournamentType === "vip" && entryFeeDollars > 0 && (await getSeasonPassActive(userId));

  if (vipFreeWithSeasonPass) {
    // VIP tournament: Season Pass holders get free entry.
  } else if (entryCoinFee > 0) {
    const { data: userRow } = await supabase.from("users").select("arena_coins").eq("id", userId).single();
    const coins = Number((userRow as { arena_coins?: number })?.arena_coins ?? 0);
    if (coins < entryCoinFee) {
      return NextResponse.json({ message: "Insufficient arena coins", required: entryCoinFee }, { status: 400 });
    }
    await supabase.from("users").update({ arena_coins: coins - entryCoinFee }).eq("id", userId);
    await supabase.from("arena_coin_transactions").insert({
      user_id: userId,
      amount: -entryCoinFee,
      type: "tournament_entry",
      description: `Entry: ${(tournament as { name?: string }).name}`,
    });
  } else if (entryFeeDollars > 0) {
    const amountCents = Math.round(entryFeeDollars * 100);
    const balanceCents = await getCanonicalBalanceCents(userId);
    if (balanceCents < amountCents) {
      return NextResponse.json({ message: "Insufficient balance", requiredCents: amountCents }, { status: 400 });
    }
    const ref = `arena_tournament_${tournamentId}_${userId}_${Date.now()}`;
    const ledger = await walletLedgerEntry(userId, "game_play", -amountCents, ref);
    if (!ledger.success) {
      return NextResponse.json({ message: ledger.message ?? "Payment failed" }, { status: 400 });
    }
  }
  // If vipFreeWithSeasonPass, no payment taken; prize pool not increased for this entry.

  const { error: insertErr } = await supabase.from("arena_tournament_entries").insert({
    tournament_id: tournamentId,
    fighter_id: fighterId,
    seed: count + 1,
  });
  if (insertErr) {
    return NextResponse.json({ message: insertErr.message }, { status: 500 });
  }

  const newCount = count + 1;
  const prizePool = (tournament as { prize_pool?: number }).prize_pool ?? 0;
  const newPrizePool = prizePool + (entryCoinFee > 0 ? 0 : vipFreeWithSeasonPass ? 0 : entryFeeDollars);
  await supabase
    .from("arena_tournaments")
    .update({ prize_pool: newPrizePool })
    .eq("id", tournamentId);

  if (newCount === (tournament as { max_fighters: number }).max_fighters) {
    const { createEmptyBracket, adminCutFromTournament } = await import("@/lib/arena-tournaments");
    const { data: allEntries } = await supabase.from("arena_tournament_entries").select("fighter_id").eq("tournament_id", tournamentId).order("seed");
    const fighterIds = (allEntries ?? []).map((e: { fighter_id: string }) => e.fighter_id);
    const bracket = createEmptyBracket(fighterIds);
    const round0 = bracket.rounds[0];
    if (round0?.matches?.length === 4) {
      const matchesWithFightId: { fighterAId: string; fighterBId: string; fightId?: string }[] = [];
      for (const m of round0.matches) {
        const { data: fight } = await supabase.from("arena_fights").insert({ fighter_a_id: m.fighterAId, fighter_b_id: m.fighterBId, fight_type: "tournament" }).select("id").single();
        matchesWithFightId.push({ fighterAId: m.fighterAId!, fighterBId: m.fighterBId!, fightId: (fight as { id: string })?.id });
      }
      const adminCut = adminCutFromTournament(newPrizePool);
      await supabase.from("arena_admin_earnings").insert({ source_type: "tournament", source_id: tournamentId, amount: adminCut });
      await supabase.from("arena_tournaments").update({ status: "in_progress", bracket: { rounds: [{ matches: matchesWithFightId }], entryOrder: bracket.entryOrder }, admin_cut: adminCut }).eq("id", tournamentId);
    }
  }

  return NextResponse.json({ success: true, entryCount: newCount });
}
