/**
 * GPC staked on the table for a `celo_room_players` row (`entry_sc`).
 */
export function celoPlayerStakeCents(row: { entry_sc?: number | null }): number {
  const n = Number(row.entry_sc ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}
