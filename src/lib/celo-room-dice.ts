/** Sanitize a single die 1..6 for UI (never crash rendering). */
export function clampDie(n: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  if (v > 6) return 6;
  return v as 1 | 2 | 3 | 4 | 5 | 6;
}

/** Shown before a round and as the face during tumble before pips are known. */
export const CELO_IDLE_DICE: [1, 1, 1] = [1, 1, 1];

/**
 * Invariant: a background fetchAll must not call setDice(null) while we already hold
 * a valid felt triplet for this round from a successful /api/celo/round/roll but the
 * public SELECT has not yet returned `banker_dice` (replica/RLS lag) or, in player_rolling,
 * the latest roll is a rerow that has no final win/loss row yet. Otherwise feltTripletPresent
 * can flip to false, visual mode stays "tumble" forever, and the UI is stuck on "Rolling…".
 */
export function shouldClobberFeltTripletOnFetch(p: {
  /** True while handleRoll still holds rollingAction. */
  rollingActionInProgress: boolean;
  activeStatus: string | null | undefined;
  serverHasBankerTriplet: boolean;
  hasPlayerFinalWinLoss: boolean;
  hasLocalFeltTriplet: boolean;
  localFeltTiedToThisRound: boolean;
}): boolean {
  if (p.rollingActionInProgress) return false;
  if (!p.hasLocalFeltTriplet) return true;
  const s = p.activeStatus ?? "";
  if (
    s === "banker_rolling" &&
    !p.serverHasBankerTriplet &&
    p.localFeltTiedToThisRound
  ) {
    return false;
  }
  if (s === "player_rolling" && !p.hasPlayerFinalWinLoss && p.localFeltTiedToThisRound) {
    return false;
  }
  return true;
}

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

/**
 * Server truth: latest resolving player roll (win/loss) wins; else banker_dice on the round.
 * Used only when we are not intentionally in a "tumble" phase (e.g. waiting on current player).
 */
export function resolveCeloFeltDice(
  lastPlayerRollDice: unknown,
  roundBankerDice: unknown
): [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6] | null {
  const fromPlayer = tripletFromDiceJson(lastPlayerRollDice);
  if (fromPlayer) return fromPlayer;
  return tripletFromDiceJson(roundBankerDice);
}

/** Explicit mode for felt UX / dev logs (single source of truth for animation). */
export type CeloVisualDiceMode =
  | "idle"
  | "banker_tumble"
  | "banker_settled"
  | "player_tumble"
  | "player_settled";

export function computeCeloVisualDiceMode(input: {
  inProgress: boolean;
  roundStatus: string | null | undefined;
  /** `celo_rounds.banker_dice` present in merged round state. */
  roundHasBankerTriplet: boolean;
  /** Felt has a triplet from API/realtime/fetch (dice state) before round row catches up. */
  feltTripletPresent: boolean;
  /** Current seat's player already has a win/loss row this round (authoritative). */
  currentPlayerHasFinalRoll: boolean;
  /** Local client is mid handleRoll() animation window. */
  localRolling: boolean;
}): CeloVisualDiceMode {
  const s = input.roundStatus ?? "";
  if (!input.inProgress) return "idle";
  if (s === "banker_rolling") {
    /** `banker_roll_in_flight` is animation-only on the server; do not gate felt UX on it. */
    if (
      input.localRolling ||
      (!input.roundHasBankerTriplet && !input.feltTripletPresent)
    ) {
      return "banker_tumble";
    }
    return "banker_settled";
  }
  if (s === "player_rolling") {
    if (input.localRolling) return "player_tumble";
    if (input.currentPlayerHasFinalRoll || input.feltTripletPresent) {
      return "player_settled";
    }
    return "player_tumble";
  }
  if (s === "betting") return "banker_settled";
  return "idle";
}
