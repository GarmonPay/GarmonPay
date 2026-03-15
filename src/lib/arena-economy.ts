/**
 * GARMONPAY ARENA — Economy rules. Enforce server-side on every transaction.
 * Owner is always in profit. Never bypass these.
 */

/** RULE 1 & 2: Admin cut on fight bets and spectator pot (10%) */
export const ADMIN_CUT_PCT = 0.10;

/** RULE 3: Admin cut on tournaments (15%) */
export const TOURNAMENT_ADMIN_CUT_PCT = 0.15;

/** RULE 7: Jackpot contribution from each fight pot (2%), taken before admin cut */
export const JACKPOT_CONTRIB_PCT = 0.02;

/** RULE 10: Odds multiplier (house edge). (opponent_stats / total_stats) * ODDS_MULTIPLIER */
export const ODDS_MULTIPLIER = 1.85;

/** RULE 9: Withdrawal fee (5% to admin) */
export const WITHDRAWAL_FEE_PCT = 0.05;
export const WITHDRAWAL_MIN_CENTS = 2000;   // $20
export const WITHDRAWAL_MAX_PER_DAY_CENTS = 50000; // $500

/** Tournament prize distribution after admin cut (8-fighter: winner 60%, runner-up 25%, semi 15%) */
export const TOURNAMENT_WINNER_PCT = 0.60;
export const TOURNAMENT_RUNNER_UP_PCT = 0.25;
export const TOURNAMENT_SEMI_PCT = 0.15;

/** Winner payout: (winner_bet * winner_odds) * (1 - ADMIN_CUT_PCT - JACKPOT_CONTRIB_PCT) */
export function winnerPayoutAfterCuts(winnerBet: number, winnerOdds: number): number {
  return winnerBet * winnerOdds * (1 - ADMIN_CUT_PCT - JACKPOT_CONTRIB_PCT);
}

export function adminCutFromPot(totalPot: number): number {
  return totalPot * ADMIN_CUT_PCT;
}

export function jackpotContribFromPot(totalPot: number): number {
  return totalPot * JACKPOT_CONTRIB_PCT;
}

/** Odds for a fighter: (opponentTotalStats / totalStats) * ODDS_MULTIPLIER */
export function computeOdds(myTotalStats: number, opponentTotalStats: number): number {
  const total = myTotalStats + opponentTotalStats;
  if (total <= 0) return ODDS_MULTIPLIER / 2;
  return (opponentTotalStats / total) * ODDS_MULTIPLIER;
}
