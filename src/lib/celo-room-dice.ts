/** Sanitize a single die 1..6 for UI (never crash rendering). */
export function clampDie(n: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  if (v > 6) return 6;
  return v as 1 | 2 | 3 | 4 | 5 | 6;
}

/** Shown before a round and as the face during `DiceFace rolling` (shake) before pips are known. */
export const CELO_IDLE_DICE: [1, 1, 1] = [1, 1, 1];

export function tripletFromDiceJson(
  raw: unknown
): [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6] | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return tripletFromDiceJson(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw) && raw.length >= 3) {
    return [clampDie(raw[0]), clampDie(raw[1]), clampDie(raw[2])];
  }
  return null;
}

/** Banker outcomes write `celo_rounds.banker_dice`; player outcomes insert `celo_player_rolls` — prefer the latest player roll, else the banker's. */
export function resolveCeloFeltDice(
  lastPlayerRollDice: unknown,
  roundBankerDice: unknown
): [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6] | null {
  const fromPlayer = tripletFromDiceJson(lastPlayerRollDice);
  if (fromPlayer) return fromPlayer;
  return tripletFromDiceJson(roundBankerDice);
}
