import { webcrypto } from "crypto";

function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytes = webcrypto.getRandomValues(new Uint32Array(1));
  return min + (bytes[0]! % range);
}

export function rollThreeDice(): [number, number, number] {
  return [randomInt(1, 6), randomInt(1, 6), randomInt(1, 6)];
}

export type RollResult = {
  dice: [number, number, number];
  result: "instant_win" | "instant_loss" | "point" | "no_count";
  rollName: string;
  point?: number;
  isCelo: boolean;
  isCraps: boolean;
};

/**
 * Street C-Lo resolution vs banker point (short stop): higher point wins; ties go to banker.
 * C-Lo (4-5-6), trips, and pair+6 are automatic wins vs any point; 1-2-3 and pair+1 lose vs any point.
 */
export function resolvePlayerVsBankerPoint(
  bankerPoint: number,
  roll: RollResult
): "player_wins" | "banker_wins" {
  if (roll.result === "instant_win") return "player_wins";
  if (roll.result === "instant_loss") return "banker_wins";
  if (roll.result === "point" && roll.point !== undefined) {
    return comparePoints(bankerPoint, roll.point) === "player_wins" ? "player_wins" : "banker_wins";
  }
  return "banker_wins";
}

export function evaluateRoll(dice: [number, number, number]): RollResult {
  const [a, b, c] = dice;
  const sorted = [...dice].sort((x, y) => x - y);
  const [lo, mid, hi] = sorted;

  // C-Lo: 4-5-6 — highest roll, automatic banker/player win
  if (lo === 4 && mid === 5 && hi === 6) {
    return {
      dice,
      result: "instant_win",
      rollName: "C-Lo (4-5-6) — street crown",
      point: undefined,
      isCelo: true,
      isCraps: false,
    };
  }

  // Trips — automatic win
  if (a === b && b === c) {
    const names: Record<number, string> = {
      1: "Trips — Aces (trip 1s)",
      2: "Trips — Deuces (trip 2s)",
      3: "Trips — Treys (trip 3s)",
      4: "Trips — Fours (trip 4s)",
      5: "Trips — Fives (trip 5s)",
      6: "Trips — Sixes (trip 6s) — head crack",
    };
    return {
      dice,
      result: "instant_win",
      rollName: names[a] || "Trips — three of a kind",
      point: undefined,
      isCelo: false,
      isCraps: false,
    };
  }

  // Pair + 6 — automatic win (hand crack)
  if (
    (a === b && c === 6) ||
    (a === c && b === 6) ||
    (b === c && a === 6)
  ) {
    return {
      dice,
      result: "instant_win",
      rollName: "Pair + 6 — hand crack (auto win)",
      point: undefined,
      isCelo: false,
      isCraps: false,
    };
  }

  // Ace-Deuce-Trey: 1-2-3 — automatic loss
  if (lo === 1 && mid === 2 && hi === 3) {
    return {
      dice,
      result: "instant_loss",
      rollName: "Ace-Deuce-Trey (1-2-3) — instant loss",
      point: undefined,
      isCelo: false,
      isCraps: true,
    };
  }

  // Pair + 1 — automatic loss
  if (
    (a === b && c === 1) ||
    (a === c && b === 1) ||
    (b === c && a === 1)
  ) {
    return {
      dice,
      result: "instant_loss",
      rollName: "Pair + 1 — instant loss",
      point: undefined,
      isCelo: false,
      isCraps: true,
    };
  }

  // Points: pair + 2–5 (re-roll if no pair / no scoring combo above)
  const pointNames: Record<number, string> = {
    2: "Point 2 — Shortly / Jit (lowest point)",
    3: "Point 3",
    4: "Point 4",
    5: "Point 5",
  };

  if ((a === b && c === 2) || (a === c && b === 2) || (b === c && a === 2)) {
    return {
      dice,
      result: "point",
      rollName: pointNames[2],
      point: 2,
      isCelo: false,
      isCraps: false,
    };
  }
  if ((a === b && c === 3) || (a === c && b === 3) || (b === c && a === 3)) {
    return {
      dice,
      result: "point",
      rollName: pointNames[3],
      point: 3,
      isCelo: false,
      isCraps: false,
    };
  }
  if ((a === b && c === 4) || (a === c && b === 4) || (b === c && a === 4)) {
    return {
      dice,
      result: "point",
      rollName: pointNames[4],
      point: 4,
      isCelo: false,
      isCraps: false,
    };
  }
  if ((a === b && c === 5) || (a === c && b === 5) || (b === c && a === 5)) {
    return {
      dice,
      result: "point",
      rollName: pointNames[5],
      point: 5,
      isCelo: false,
      isCraps: false,
    };
  }

  return {
    dice,
    result: "no_count",
    rollName: "No point — re-roll",
    point: undefined,
    isCelo: false,
    isCraps: false,
  };
}

export function comparePoints(
  bankerPoint: number,
  playerPoint: number
): "player_wins" | "banker_wins" {
  if (playerPoint > bankerPoint) return "player_wins";
  return "banker_wins";
}

export function calculatePayout(
  entrySC: number,
  outcome: "win" | "loss" | "push",
  platformFeePct: number = 10
): { payoutSC: number; feeSC: number } {
  if (outcome === "win") {
    const gross = entrySC * 2;
    const feeSC = Math.floor((gross * platformFeePct) / 100);
    return { payoutSC: gross - feeSC, feeSC };
  }
  if (outcome === "push") {
    return { payoutSC: entrySC, feeSC: 0 };
  }
  return { payoutSC: 0, feeSC: 0 };
}

// ── Shop dice types (used by /api/celo/dice/buy) ───────────────────────────────

export const DICE_TYPES = {
  standard: { name: "Standard", costCents: 0, color: "red" },
  gold: { name: "Gold", costCents: 100, color: "gold" },
  diamond: { name: "Diamond", costCents: 200, color: "diamond" },
  blood: { name: "Blood", costCents: 150, color: "blood" },
  street: { name: "Street", costCents: 100, color: "green" },
  midnight: { name: "Midnight", costCents: 100, color: "black" },
  fire: { name: "Fire", costCents: 150, color: "fire" },
} as const;

export type DiceType = keyof typeof DICE_TYPES;
