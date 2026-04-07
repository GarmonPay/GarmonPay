/**
 * Cents staked on the table for a `celo_room_players` row.
 * Use `||` not `??`: DB often has entry_sc = 0 default while bet_cents holds the real stake.
 */
export function celoPlayerStakeCents(row: { entry_sc?: number | null; bet_cents?: number | null }): number {
  const n = Number(row.entry_sc || row.bet_cents || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}
