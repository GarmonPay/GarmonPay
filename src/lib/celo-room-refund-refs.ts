/**
 * Stable ledger references for C-Lo room lifecycle (pair with create debit `celo_bank_deposit_<roomId>`).
 * `wallet_ledger.reference` is UNIQUE — duplicates return "Duplicate transaction" from wallet_ledger_entry.
 */

export function celoBankDepositReference(roomId: string): string {
  return `celo_bank_deposit_${roomId}`;
}

/** Single banker bank credit allowed per room (close OR delete, not both). */
export function celoBankRefundReference(roomId: string): string {
  return `celo_bank_refund_${roomId}`;
}

/** One player stake refund per (room, user) for close/cancel flows. */
export function celoPlayerStakeRefundReference(roomId: string, playerUserId: string): string {
  return `celo_room_player_refund_${roomId}_${playerUserId}`;
}
