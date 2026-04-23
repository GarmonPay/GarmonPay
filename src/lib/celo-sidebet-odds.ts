/** Side-entry multipliers (must match `/api/celo/sidebet/create` ODDS). */
export const CELO_SIDEBET_ODDS: Record<string, number> = {
  celo: 8.0,
  shit: 8.0,
  hand_crack: 4.5,
  trips: 8.0,
  banker_wins: 1.8,
  player_wins: 1.8,
};

export const CELO_SIDEBET_TYPES = Object.keys(CELO_SIDEBET_ODDS) as string[];
