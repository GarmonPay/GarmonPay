/**
 * Arena tournament helpers: bracket structure, prize distribution, admin 15%.
 */

import {
  TOURNAMENT_ADMIN_CUT_PCT,
  TOURNAMENT_WINNER_PCT,
  TOURNAMENT_RUNNER_UP_PCT,
  TOURNAMENT_SEMI_PCT,
} from "./arena-economy";

type SupabaseAdminClient = any; // supabase admin client — full type not imported to avoid bundle overhead

export type TournamentType = "daily" | "weekly" | "monthly" | "vip";

export const TOURNAMENT_ENTRY: Record<TournamentType, { dollars: number; coins?: number }> = {
  daily: { dollars: 0, coins: 100 },
  weekly: { dollars: 5, coins: undefined },
  monthly: { dollars: 20, coins: undefined },
  vip: { dollars: 50, coins: undefined },
};

export interface BracketMatch {
  fightId?: string;
  fighterAId?: string;
  fighterBId?: string;
  winnerId?: string | null;
}

export interface BracketRound {
  matches: BracketMatch[];
}

export interface BracketData {
  rounds: BracketRound[];
  entryOrder?: string[]; // fighter_id in seed order
}

export function createEmptyBracket(entryFighterIds: string[]): BracketData {
  const n = entryFighterIds.length;
  if (n !== 8) return { rounds: [], entryOrder: entryFighterIds };
  const shuffled = [...entryFighterIds].sort(() => Math.random() - 0.5);
  const round0: BracketRound = {
    matches: [
      { fighterAId: shuffled[0], fighterBId: shuffled[1] },
      { fighterAId: shuffled[2], fighterBId: shuffled[3] },
      { fighterAId: shuffled[4], fighterBId: shuffled[5] },
      { fighterAId: shuffled[6], fighterBId: shuffled[7] },
    ],
  };
  return { rounds: [round0], entryOrder: shuffled };
}

export function prizePoolAfterAdminCut(prizePool: number): number {
  return prizePool * (1 - TOURNAMENT_ADMIN_CUT_PCT);
}

export function adminCutFromTournament(prizePool: number): number {
  return prizePool * TOURNAMENT_ADMIN_CUT_PCT;
}

/** For 8-fighter: winner 60%, runner-up 25%, two semi 7.5% each. Returns { winner, runnerUp, semi: [id, id] } in dollars. */
export function distributePrizes(prizePoolAfterCut: number): {
  winner: number;
  runnerUp: number;
  semi: [number, number];
} {
  return {
    winner: prizePoolAfterCut * TOURNAMENT_WINNER_PCT,
    runnerUp: prizePoolAfterCut * TOURNAMENT_RUNNER_UP_PCT,
    semi: [
      prizePoolAfterCut * (TOURNAMENT_SEMI_PCT / 2),
      prizePoolAfterCut * (TOURNAMENT_SEMI_PCT / 2),
    ],
  };
}

/**
 * After a tournament fight completes, record the result in the bracket,
 * advance winners to the next round, and detect tournament completion.
 */
export async function advanceTournamentBracket(
  supabase: SupabaseAdminClient,
  tournamentId: string,
  fightId: string,
  winnerId: string
): Promise<void> {
  // Load tournament
  const { data: t, error: tErr } = await supabase
    .from("arena_tournaments")
    .select("id, status, bracket, prize_pool")
    .eq("id", tournamentId)
    .single();
  if (tErr || !t) return;
  if (t.status === "completed") return;

  const bracket: BracketData = (t.bracket as BracketData) ?? { rounds: [] };

  // Find which round and match this fightId belongs to
  let foundRoundIdx = -1;
  let foundMatchIdx = -1;
  for (let rIdx = 0; rIdx < bracket.rounds.length; rIdx++) {
    const round = bracket.rounds[rIdx];
    for (let mIdx = 0; mIdx < round.matches.length; mIdx++) {
      if (round.matches[mIdx].fightId === fightId) {
        foundRoundIdx = rIdx;
        foundMatchIdx = mIdx;
        break;
      }
    }
    if (foundRoundIdx !== -1) break;
  }
  if (foundRoundIdx === -1) return;

  // Record winner in bracket
  bracket.rounds[foundRoundIdx].matches[foundMatchIdx].winnerId = winnerId;

  const currentRound = bracket.rounds[foundRoundIdx];
  const allDone = currentRound.matches.every((m) => m.winnerId != null);

  if (allDone) {
    const winners = currentRound.matches.map((m) => m.winnerId as string);
    const isFinal = winners.length === 1;

    if (isFinal) {
      // Tournament complete — crown champion
      await supabase
        .from("arena_tournaments")
        .update({ bracket, status: "completed", champion_id: winners[0] })
        .eq("id", tournamentId);
      return;
    }

    // Build next round matches
    const nextMatches: BracketMatch[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (winners[i + 1] != null) {
        nextMatches.push({ fighterAId: winners[i], fighterBId: winners[i + 1] });
      }
    }

    if (nextMatches.length > 0) {
      // Create fight records for next round
      const nextRound: BracketRound = { matches: [] };
      for (const match of nextMatches) {
        // Look up fighter user_ids for the fight record
        const { data: fighters } = await supabase
          .from("arena_fighters")
          .select("id")
          .in("id", [match.fighterAId, match.fighterBId]);
        if (fighters && fighters.length === 2) {
          const { data: newFight } = await supabase
            .from("arena_fights")
            .insert({
              fighter_a_id: match.fighterAId,
              fighter_b_id: match.fighterBId,
              fight_type: "tournament",
              tournament_id: tournamentId,
              round: foundRoundIdx + 1,
            })
            .select("id")
            .single();
          nextRound.matches.push({ ...match, fightId: newFight?.id });
        } else {
          nextRound.matches.push(match);
        }
      }
      bracket.rounds.push(nextRound);
    }
  }

  await supabase
    .from("arena_tournaments")
    .update({ bracket })
    .eq("id", tournamentId);
}
