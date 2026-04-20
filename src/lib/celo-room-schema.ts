/**
 * `celo_rooms` reads/writes use `minimum_entry_sc`, `current_bank_sc`, `banker_reserve_sc`.
 */

export const CELO_ROOMS_COL = {
  minimumEntry: "minimum_entry_sc",
  currentBank: "current_bank_sc",
  bankerReserve: "banker_reserve_sc",
} as const;

/** Normalized room shape aligned to DB column names (GPC integer “cents”). */
export type NormalizedCeloRoom = Record<string, unknown> & {
  id: string;
  name: string;
  creator_id: string;
  banker_id?: string;
  status?: string;
  room_type?: string;
  join_code?: string | null;
  max_players: number;
  minimum_entry_sc: number;
  current_bank_sc: number;
  banker_reserve_sc: number;
  platform_fee_pct: number;
  total_rounds: number;
};

export function normalizeCeloRoomRow(row: Record<string, unknown> | null | undefined): NormalizedCeloRoom | null {
  if (!row) return null;
  const min = Number(row.minimum_entry_sc ?? 0);
  const bank = Number(row.current_bank_sc ?? 0);
  const reserveRaw = Number(row.banker_reserve_sc ?? bank ?? 0);
  const banker_reserve_sc = Number.isFinite(reserveRaw) ? Math.max(0, Math.round(reserveRaw)) : 0;
  const fee = Number(row.platform_fee_pct ?? 10);
  const maxPlayers = Number(row.max_players ?? 0);
  const totalRounds = Number(row.total_rounds ?? 0);
  return {
    ...row,
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    creator_id: String(row.creator_id ?? ""),
    minimum_entry_sc: min,
    current_bank_sc: bank,
    banker_reserve_sc,
    platform_fee_pct: fee,
    max_players: maxPlayers,
    total_rounds: totalRounds,
  };
}

/** PATCH body for updating only the live bank column in DB. */
export function celoRoomBankUpdate(newBankCents: number): Record<string, number> {
  return { [CELO_ROOMS_COL.currentBank]: newBankCents };
}

/** Bank column + other `celo_rooms` fields in one update payload. */
export function mergeCeloRoomUpdate(newBankCents: number, rest: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...celoRoomBankUpdate(newBankCents), ...rest };
}
