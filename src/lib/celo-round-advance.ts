import type { SupabaseClient } from "@supabase/supabase-js";
import { settleCeloOpenSideBets } from "@/lib/celo-side-bets-settle";
import { getEligibleStakedPlayers } from "@/lib/celo-eligible-players";

export async function finalizeCeloPlayerRollingRound(
  supabase: SupabaseClient,
  roomId: string,
  roundId: string,
  now: string
) {
  await Promise.all([
    supabase
      .from("celo_rounds")
      .update({ status: "completed", completed_at: now })
      .eq("id", roundId),
    supabase
      .from("celo_rooms")
      .update({ status: "active", last_activity: now })
      .eq("id", roomId),
  ]);
  await settleCeloOpenSideBets(supabase, roundId, roomId);
}

export async function buildCeloRoundSummary(supabase: SupabaseClient, roundId: string) {
  const { data: rolls } = await supabase
    .from("celo_player_rolls")
    .select("user_id, outcome, payout_sc, entry_sc")
    .eq("round_id", roundId)
    .in("outcome", ["win", "loss"])
    .order("created_at", { ascending: true });

  const list = (rolls ?? []) as {
    user_id: string;
    outcome: string;
    payout_sc: number;
    entry_sc: number;
  }[];

  let bankerNetCents = 0;
  const playerResults = list.map((row) => {
    if (row.outcome === "win") {
      bankerNetCents -= row.payout_sc;
      return {
        userId: row.user_id,
        outcome: "win" as const,
        amountCents: row.payout_sc,
        label: `Won $${(row.payout_sc / 100).toFixed(2)}`,
      };
    }
    bankerNetCents += row.entry_sc;
    return {
      userId: row.user_id,
      outcome: "loss" as const,
      amountCents: row.entry_sc,
      label: `Lost $${(row.entry_sc / 100).toFixed(2)}`,
    };
  });

  return {
    playerResults,
    bankerNetCents,
    bankerLabel:
      bankerNetCents >= 0
        ? `Banker up $${(bankerNetCents / 100).toFixed(2)} this round`
        : `Bank paid out $${(Math.abs(bankerNetCents) / 100).toFixed(2)} net`,
  };
}

/** After a resolving player roll, move to next seat or complete the round. */
export async function advanceAfterResolvingCeloPlayerRoll(
  supabase: SupabaseClient,
  roomId: string,
  roundId: string,
  rollerUserId: string,
  coveredBy: string | null,
  now: string
): Promise<{ roundComplete: boolean; summary?: Record<string, unknown> }> {
  const eligible = await getEligibleStakedPlayers(supabase, roomId, coveredBy);
  const idx = eligible.findIndex((p) => p.user_id === rollerUserId);
  const next = idx >= 0 ? eligible[idx + 1] : null;

  if (!next) {
    await finalizeCeloPlayerRollingRound(supabase, roomId, roundId, now);
    const summary = await buildCeloRoundSummary(supabase, roundId);
    return { roundComplete: true, summary: summary as unknown as Record<string, unknown> };
  }

  await supabase
    .from("celo_rounds")
    .update({ current_player_seat: next.seat_number ?? 1 })
    .eq("id", roundId);

  return { roundComplete: false };
}
