/** Sanitize a single die 1..6 for UI (never crash rendering). */
export function clampDie(n: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  if (v > 6) return 6;
  return v as 1 | 2 | 3 | 4 | 5 | 6;
}

/** True only for three integer pips 1–6 from the server (never a placeholder). */
export function isRealDiceValues(values: unknown): values is number[] {
  return (
    Array.isArray(values) &&
    values.length === 3 &&
    values.every((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 6;
    })
  );
}

/**
 * Parse `banker_dice`, roll `dice` JSON, etc. — returns null unless all three
 * values are real integer pips (no clamping to fake defaults).
 */
export function realDiceTripletFromUnknown(
  raw: unknown
): [number, number, number] | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return realDiceTripletFromUnknown(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const t = [raw[0], raw[1], raw[2]];
  if (!isRealDiceValues(t)) return null;
  return [Number(t[0]), Number(t[1]), Number(t[2])];
}

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
    const t = realDiceTripletFromUnknown(r.dice);
    if (t) return t;
  }
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isInteger(x) && x >= 1 && x <= 6 ? x : NaN;
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
): [number, number, number] | null {
  const fromPlayer = realDiceTripletFromUnknown(lastPlayerRollDice);
  if (fromPlayer) return fromPlayer;
  return realDiceTripletFromUnknown(roundBankerDice);
}

/** Metadata for `[C-Lo Dice Sync]` and felt rendering (all values from DB / API). */
export type CeloServerVisibleDice = {
  triplet: [number, number, number] | null;
  rollId: string | null;
  rollerUserId: string | null;
  source:
    | "none"
    | "banker_in_flight"
    | "banker_idle_preview"
    | "banker_round"
    | "banker_point_phase"
    | "player_anim_banker_bg"
    | "player_roll"
    | "completed_player"
    | "completed_banker_only"
    | "betting_banker";
};

/**
 * Single source of truth for which three dice every client should show from server state.
 * `rolls` should be newest-first (e.g. `order("created_at", { ascending: false })`).
 * Local optimistic dice from a just-finished POST should override via `dice` state in the UI layer.
 */
export function getVisibleDiceFromServer(
  round: Record<string, unknown> | null | undefined,
  rollsNewestFirst: Record<string, unknown>[],
  ctx: { rollerUserId: string | null }
): CeloServerVisibleDice {
  const none = (): CeloServerVisibleDice => ({
    triplet: null,
    rollId: null,
    rollerUserId: null,
    source: "none",
  });
  if (!round) return none();

  const status = String(round.status ?? "").toLowerCase();
  const bankerDice = realDiceTripletFromUnknown(round.banker_dice);
  const bankerInFlight = round.banker_roll_in_flight === true;
  const rollProcessing = round.roll_processing === true;
  const roller = ctx.rollerUserId?.trim() ? String(ctx.rollerUserId) : null;

  if (status === "banker_rolling") {
    if (bankerInFlight) {
      return {
        triplet: null,
        rollId: null,
        rollerUserId: null,
        source: "banker_in_flight",
      };
    }
    if (bankerDice) {
      return {
        triplet: bankerDice,
        rollId: null,
        rollerUserId: null,
        source: "banker_round",
      };
    }
    const idlePreview = realDiceTripletFromUnknown(
      (round as { idle_preview_dice?: unknown }).idle_preview_dice
    );
    if (idlePreview) {
      return {
        triplet: idlePreview,
        rollId: null,
        rollerUserId: null,
        source: "banker_idle_preview",
      };
    }
    return none();
  }

  if (status === "player_rolling") {
    if (rollProcessing && bankerDice) {
      return {
        triplet: bankerDice,
        rollId: null,
        rollerUserId: roller,
        source: "player_anim_banker_bg",
      };
    }
    if (roller) {
      for (const r of rollsNewestFirst) {
        if (String(r.user_id ?? "") !== roller) continue;
        const t = extractDiceFromRoll(r);
        if (t && isRealDiceValues(t)) {
          return {
            triplet: t,
            rollId: r.id != null ? String(r.id) : null,
            rollerUserId: roller,
            source: "player_roll",
          };
        }
      }
    }
    if (bankerDice) {
      return {
        triplet: bankerDice,
        rollId: null,
        rollerUserId: roller,
        source: "banker_point_phase",
      };
    }
    return none();
  }

  if (status === "betting") {
    if (bankerDice) {
      return {
        triplet: bankerDice,
        rollId: null,
        rollerUserId: null,
        source: "betting_banker",
      };
    }
    return none();
  }

  if (status === "completed") {
    for (const r of rollsNewestFirst) {
      const o = String(r.outcome ?? "").toLowerCase();
      if (o !== "win" && o !== "loss" && o !== "push") continue;
      const t = extractDiceFromRoll(r);
      if (t && isRealDiceValues(t)) {
        return {
          triplet: t,
          rollId: r.id != null ? String(r.id) : null,
          rollerUserId: r.user_id != null ? String(r.user_id) : null,
          source: "completed_player",
        };
      }
    }
    if (bankerDice) {
      return {
        triplet: bankerDice,
        rollId: null,
        rollerUserId: null,
        source: "completed_banker_only",
      };
    }
    return none();
  }

  return none();
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
    // Legacy rows without idle_preview_dice: static empty felt, not infinite tumble.
    return "idle";
  }
  if (s === "player_rolling") {
    // Player has a final roll committed → show their settled dice
    if (input.currentPlayerHasFinalRoll) return "player_settled";

    // Player is actively rolling now → show their tumble
    if (input.rollingAction || input.localRolling || input.serverPlayerInFlight)
      return "player_tumble";

    // Local felt has a triplet (e.g. just-rolled state held briefly) → show it
    if (input.feltTripletPresent) return "player_settled";

    // Banker has rolled → show banker dice persistently while waiting for player
    if (input.roundHasBankerTriplet) return "banker_settled";

    return "idle";
  }
  if (s === "betting") return "banker_settled";
  return "idle";
}
