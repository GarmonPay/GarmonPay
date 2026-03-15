/**
 * Arena tournament helpers: bracket structure, prize distribution, admin 15%.
 */

import {
  TOURNAMENT_ADMIN_CUT_PCT,
  TOURNAMENT_WINNER_PCT,
  TOURNAMENT_RUNNER_UP_PCT,
  TOURNAMENT_SEMI_PCT,
} from "./arena-economy";

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
