/**
 * C-Lo banker reserve (liability cap) — integer GPC cents.
 *
 * - `banker_reserve_sc`: maximum **sum** of active player table stakes (`celo_room_players.entry_sc`)
 *   the table may carry.
 */

import { celoPlayerStakeCents } from "@/lib/celo-player-stake";

export type CeloStakeRow = { entry_sc?: number | null };

/** Sum of table stakes for `role === "player"` rows (cents). */
export function sumPlayerTableStakesCents(rows: CeloStakeRow[]): number {
  return rows.reduce((s, r) => s + celoPlayerStakeCents(r), 0);
}

/** After replacing one player’s stake, new total committed (cents). */
export function totalCommittedAfterStakeReplacement(params: {
  totalCommittedAllPlayers: number;
  previousStakeThisPlayer: number;
  newStakeThisPlayer: number;
}): number {
  const { totalCommittedAllPlayers, previousStakeThisPlayer, newStakeThisPlayer } = params;
  return totalCommittedAllPlayers - previousStakeThisPlayer + newStakeThisPlayer;
}

const DEFAULT_EXCEEDS =
  "Total player stakes cannot exceed the banker reserved liability cap for this table (integer US cents).";

export function assertSumStakesWithinReserve(params: {
  reserveCents: number;
  sumStakesCents: number;
  /** Override API error string (e.g. join vs cover-bank). */
  messageWhenExceeded?: string;
}): { ok: true } | { ok: false; message: string } {
  const { reserveCents, sumStakesCents, messageWhenExceeded } = params;
  if (sumStakesCents > reserveCents) {
    return {
      ok: false,
      message: messageWhenExceeded ?? DEFAULT_EXCEEDS,
    };
  }
  return { ok: true };
}
