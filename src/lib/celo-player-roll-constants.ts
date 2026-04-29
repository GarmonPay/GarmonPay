/** Time allowed for the seated player to submit a roll once it is their turn (player_rolling). */
export const CELO_PLAYER_ROLL_TIMEOUT_MS = 30_000;

export function nextPlayerRollDeadlineIso(): string {
  return new Date(Date.now() + CELO_PLAYER_ROLL_TIMEOUT_MS).toISOString();
}
