/**
 * Production `celo_rooms` may use `minimum_entry_sc` / `current_bank_sc` (sweeps/street cents).
 * Migrations in-repo historically used `min_bet_cents` / `current_bank_cents`.
 * Normalize reads to canonical app fields; use *_db* helpers for writes.
 */

export const CELO_ROOMS_COL = {
  minimumEntry: "minimum_entry_sc",
  currentBank: "current_bank_sc",
  /** Max sum of player table stakes, integer US cents (`banker_reserve_sc` in DB). */
  bankerReserve: "banker_reserve_sc",
} as const;

/** Normalized room shape for UI + API logic (always cents). */
export type NormalizedCeloRoom = Record<string, unknown> & {
  id: string;
  name: string;
  creator_id: string;
  banker_id?: string;
  status?: string;
  room_type?: string;
  join_code?: string | null;
  max_players: number;
  min_bet_cents: number;
  current_bank_cents: number;
  /** Banker's reserved liability cap (integer US cents); sum of player stakes must stay ≤ this. */
  banker_reserve_cents: number;
  max_bet_cents: number;
  platform_fee_pct: number;
  /** Mirrors DB celo_rooms.total_rounds (also updated by trigger on round complete). */
  total_rounds: number;
};

export function normalizeCeloRoomRow(row: Record<string, unknown> | null | undefined): NormalizedCeloRoom | null {
  if (!row) return null;
  const min = Number(row.minimum_entry_sc ?? row.min_bet_cents ?? 0);
  const bank = Number(row.current_bank_sc ?? row.current_bank_cents ?? 0);
  const reserveRaw = Number(
    row.banker_reserve_sc ?? row.banker_reserve_cents ?? bank ?? 0
  );
  const banker_reserve_cents = Number.isFinite(reserveRaw) ? Math.max(0, Math.round(reserveRaw)) : 0;
  const maxBet = Number(row.max_bet_cents ?? Math.max(min * 10, bank));
  const fee = Number(row.platform_fee_pct ?? 10);
  const maxPlayers = Number(row.max_players ?? 0);
  const totalRounds = Number(row.total_rounds ?? 0);
  return {
    ...row,
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    creator_id: String(row.creator_id ?? ""),
    min_bet_cents: min,
    current_bank_cents: bank,
    banker_reserve_cents,
    max_bet_cents: maxBet,
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
