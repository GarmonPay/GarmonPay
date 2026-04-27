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
  if (s === "completed" && p.hasLocalFeltTriplet && p.localFeltTiedToThisRound) {
    return false;
  }
  return true;
}

/**
 * Parse dice from a roll row or API object (DB column `dice`, or dice_1..3, die1..3, d1..d3, or `dice` array).
 */
export function extractDiceFromRoll(row: unknown): [number, number, number] | null {
  if (row == null || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.dice != null) {
    const t = tripletFromDiceJson(r.dice);
    if (t) return [t[0], t[1], t[2]];
  }
  const n = (v: unknown) => {
    const x = Math.floor(Number(v));
    return Number.isFinite(x) ? x : NaN;
  };
  const u1 = n(r.dice_1 ?? r.die1 ?? r.d1);
  const u2 = n(r.dice_2 ?? r.die2 ?? r.d2);
  const u3 = n(r.dice_3 ?? r.die3 ?? r.d3);
  if (Number.isFinite(u1) && Number.isFinite(u2) && Number.isFinite(u3)) {
    return [u1, u2, u3];
  }
  return null;
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
  /** True while POST /api/celo/round/roll is in flight (not the same as round phase). */
  rollingAction: boolean;
  /** Local client handleRoll() animation (min delay); prefer rollingAction to avoid stuck tumble. */
  localRolling: boolean;
  serverBankerInFlight: boolean;
  serverPlayerInFlight: boolean;
  /** Round is completed but room not yet waiting — keep final dice on felt. */
  resultPauseActive?: boolean;
}): CeloVisualDiceMode {
  const s = input.roundStatus ?? "";
  const paused =
    input.resultPauseActive === true &&
    String(s).toLowerCase() === "completed";
  if (!input.inProgress && !paused) return "idle";
  if (paused) {
    if (input.currentPlayerHasFinalRoll || input.feltTripletPresent) {
      return "player_settled";
    }
    if (input.roundHasBankerTriplet) {
      return "banker_settled";
    }
    return "idle";
  }
  if (s === "banker_rolling") {
    if (input.rollingAction || input.localRolling || input.serverBankerInFlight) {
      return "banker_tumble";
    }
    if (input.roundHasBankerTriplet || input.feltTripletPresent) {
      return "banker_settled";
    }
    return "idle";
  }
  if (s === "player_rolling") {
    if (input.rollingAction || input.localRolling || input.serverPlayerInFlight) {
      return "player_tumble";
    }
    if (input.currentPlayerHasFinalRoll || input.feltTripletPresent) {
      return "player_settled";
    }
    if (input.roundHasBankerTriplet) {
      return "banker_settled";
    }
    return "idle";
  }
  if (s === "betting") return "banker_settled";
  return "idle";
}
