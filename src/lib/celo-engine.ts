import { randomInt } from "crypto";

// ── TYPES ──────────────────────────────────────────────────────────────────────

export type RollResult = {
  dice: [number, number, number];
  rollName: string;
  result: "instant_win" | "instant_loss" | "point" | "no_count";
  point?: number;
  isCelo: boolean;
};

export type PayoutResult = {
  winnerCents: number;
  platformFeeCents: number;
  netPayoutCents: number;
};

// ── DICE ROLL ──────────────────────────────────────────────────────────────────

export function rollThreeDice(): [number, number, number] {
  const d1 = randomInt(1, 7);
  const d2 = randomInt(1, 7);
  const d3 = randomInt(1, 7);
  return [d1, d2, d3];
}

// ── EVALUATE ROLL ──────────────────────────────────────────────────────────────

export function evaluateRoll(dice: [number, number, number]): RollResult {
  const [a, b, c] = dice;
  const sorted = [...dice].sort((x, y) => x - y) as [number, number, number];
  const [s1, s2, s3] = sorted;

  // ── INSTANT WINS ──

  // C-Lo: 4-5-6
  if (s1 === 4 && s2 === 5 && s3 === 6) {
    return {
      dice,
      rollName: "C-LO! 🎲",
      result: "instant_win",
      isCelo: true,
    };
  }

  // Trips: all three the same
  if (s1 === s2 && s2 === s3) {
    const tripNames: Record<number, string> = {
      1: "ACE OUT! 🎲",
      2: "TRIP DEUCES! 🎲",
      3: "TRIP THREES! 🎲",
      4: "TRIP FOURS! 🎲",
      5: "TRIP FIVES! 🎲",
      6: "TRIP SIXES - THE BOSS! 👑",
    };
    return {
      dice,
      rollName: tripNames[s1] ?? `TRIPS ${s1}! 🎲`,
      result: "instant_win",
      isCelo: false,
    };
  }

  // Pair + 6 = Hand Crack (instant win)
  if (
    (a === b && c === 6 && a !== 6) ||
    (a === c && b === 6 && a !== 6) ||
    (b === c && a === 6 && b !== 6)
  ) {
    return {
      dice,
      rollName: "HAND CRACK! 💥",
      result: "instant_win",
      isCelo: false,
    };
  }

  // ── INSTANT LOSSES ──

  // Shit: 1-2-3
  if (s1 === 1 && s2 === 2 && s3 === 3) {
    return {
      dice,
      rollName: "SHIT! 💩",
      result: "instant_loss",
      isCelo: false,
    };
  }

  // Pair + 1 = Dick (instant loss)
  if (
    (a === b && c === 1 && a !== 1) ||
    (a === c && b === 1 && a !== 1) ||
    (b === c && a === 1 && b !== 1)
  ) {
    return {
      dice,
      rollName: "DICK! 😂",
      result: "instant_loss",
      isCelo: false,
    };
  }

  // ── POINTS ──

  let pairValue: number | null = null;
  let oddValue: number | null = null;

  if (a === b && c !== a) {
    pairValue = a;
    oddValue = c;
  } else if (a === c && b !== a) {
    pairValue = a;
    oddValue = b;
  } else if (b === c && a !== b) {
    pairValue = b;
    oddValue = a;
  }

  if (pairValue !== null && oddValue !== null) {
    const pointNames: Record<number, string[]> = {
      5: ["POUND! 🔵", "POLICE! 🚔"],
      4: ["ZOE! 🇭🇹", "HAITIAN! 🇭🇹"],
      3: ["GIRL! 👧", "HOE! 😅"],
      2: ["SHORTLY! 👶", "JIT! 👶"],
    };
    const names = pointNames[oddValue];
    if (names) {
      const name = names[randomInt(0, 2)];
      return {
        dice,
        rollName: name,
        result: "point",
        point: oddValue,
        isCelo: false,
      };
    }
  }

  // ── NO COUNT ──
  return {
    dice,
    rollName: "No Count — Roll Again 🎲",
    result: "no_count",
    isCelo: false,
  };
}

// ── COMPARE POINTS ─────────────────────────────────────────────────────────────

export function comparePoints(
  bankerPoint: number,
  playerPoint: number
): "player_wins" | "banker_wins" {
  if (playerPoint > bankerPoint) return "player_wins";
  return "banker_wins"; // ties go to banker
}

/** 1-2-3 — worst banker roll (full table loss path). */
export function isBankerShitRoll(dice: [number, number, number]): boolean {
  const sorted = [...dice].sort((x, y) => x - y);
  return sorted[0] === 1 && sorted[1] === 2 && sorted[2] === 3;
}

/**
 * Pair + 1 ("Dick") — bad roll, banker loses a small amount from the bank only;
 * does not rotate banker or pay the whole table like shit.
 */
export function isBankerDickRoll(dice: [number, number, number]): boolean {
  if (isBankerShitRoll(dice)) return false;
  const [a, b, c] = dice;
  return (
    (a === b && c === 1 && a !== 1) ||
    (a === c && b === 1 && a !== 1) ||
    (b === c && a === 1 && b !== 1)
  );
}

// ── CALCULATE PAYOUT ──────────────────────────────────────────────────────────

export function calculatePayout(
  entryCents: number,
  platformFeePct: number = 10
): PayoutResult {
  const grossPayout = entryCents * 2;
  const platformFeeCents = Math.floor((grossPayout * platformFeePct) / 100);
  const netPayoutCents = grossPayout - platformFeeCents;
  return { winnerCents: grossPayout, platformFeeCents, netPayoutCents };
}

// ── VALIDATE ENTRY AMOUNT ─────────────────────────────────────────────────────

export function validateEntry(
  entryCents: number,
  minimumCents: number
): { valid: boolean; error?: string } {
  if (entryCents < minimumCents) {
    return {
      valid: false,
      error: `Minimum entry is ${minimumCents} cents`,
    };
  }
  if (minimumCents > 0 && entryCents % minimumCents !== 0) {
    return {
      valid: false,
      error: `Entry must be a multiple of ${minimumCents} cents`,
    };
  }
  return { valid: true };
}

// ── CALCULATE BANK GROWTH ─────────────────────────────────────────────────────

export function calculateBankGrowth(
  currentBankCents: number,
  bankerWinningsCents: number
): number {
  return currentBankCents + bankerWinningsCents;
}

// ── DICE TYPES ────────────────────────────────────────────────────────────────

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
