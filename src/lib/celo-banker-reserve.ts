/**
 * C-Lo banker reserve (liability cap) — **integer US cents** (1 = $0.01).
 *
 * - `banker_reserve_sc` / normalized `banker_reserve_cents`: maximum **sum** of active player
 *   table stakes (`celo_room_players` role=player, `entry_sc || bet_cents`) the table may carry.
 * - It is **not** a second wallet balance; funds are locked via the **single** `game_play` debit
 *   on room create (`celo_bank_deposit_<roomId>`) and any **additional** debits when the banker
 *   tops up the bank (`lower-bank` route when delta > 0), which must increase `banker_reserve_sc`
 *   by the same delta.
 *
 * Naming: `_sc` suffix = “sweeps cents” / street cents in migrations; values are still **cents**.
 */

import { celoPlayerStakeCents } from "@/lib/celo-player-stake";

export type CeloStakeRow = { bet_cents?: number | null; entry_sc?: number | null };

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
