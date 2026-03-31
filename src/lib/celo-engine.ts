/**
 * C-Lo (street dice) game engine — SERVER ONLY.
 * Use from API routes / Node; never import in client bundles for dice logic.
 */

import { randomInt } from "node:crypto";

export type RollResultKind = "instant_win" | "instant_loss" | "point" | "no_count";

export function rollThreeDice(): [number, number, number] {
  return [randomInt(1, 7), randomInt(1, 7), randomInt(1, 7)];
}

function pickVariant(a: string, b: string): string {
  return randomInt(0, 2) === 0 ? a : b;
}

export function evaluateRoll(dice: [number, number, number]): {
  rollName: string;
  result: RollResultKind;
  point?: number;
  dice: number[];
} {
  const sorted = [...dice].sort((a, b) => a - b) as [number, number, number];
  const [a, b, c] = sorted;
  const set = new Set(sorted);

  // 1. C-Lo: 4, 5, 6
  if (set.has(4) && set.has(5) && set.has(6)) {
    return { rollName: "C-LO! 🎲", result: "instant_win", dice: sorted };
  }

  // 2. Trips
  if (a === c) {
    const tripNames: Record<number, string> = {
      1: "ACE OUT! 🎲",
      2: "TRIP DEUCES! 🎲",
      3: "TRIP THREES! 🎲",
      4: "TRIP FOURS! 🎲",
      5: "TRIP FIVES! 🎲",
      6: "TRIP SIXES - THE BOSS! 👑",
    };
    return {
      rollName: tripNames[a] ?? "TRIPS! 🎲",
      result: "instant_win",
      dice: sorted,
    };
  }

  // 3. Shit: 1, 2, 3
  if (a === 1 && b === 2 && c === 3) {
    return { rollName: "SHIT! 💩", result: "instant_loss", dice: sorted };
  }

  // Pair patterns (not triple)
  let singleton: number | null = null;
  if (a === b && c !== a) {
    singleton = c;
  } else if (b === c && a !== b) {
    singleton = a;
  } else {
    return { rollName: "No Count - Roll Again", result: "no_count", dice: sorted };
  }

  // Hand crack: pair + singleton 6 (e.g. 1,1,6 not triple)
  if (singleton === 6) {
    return { rollName: "HAND CRACK! 💥", result: "instant_win", dice: sorted };
  }

  // Dick: singleton is 1
  if (singleton === 1) {
    return { rollName: "DICK! 😂", result: "instant_loss", dice: sorted };
  }

  // Points by singleton value
  if (singleton === 5) {
    return {
      rollName: pickVariant("POUND! 🔵", "POLICE! 🚔"),
      result: "point",
      point: 5,
      dice: sorted,
    };
  }
  if (singleton === 4) {
    return {
      rollName: pickVariant("ZOE! 🇭🇹", "HAITIAN! 🇭🇹"),
      result: "point",
      point: 4,
      dice: sorted,
    };
  }
  if (singleton === 3) {
    return {
      rollName: pickVariant("GIRL! 👧", "HOE! 😅"),
      result: "point",
      point: 3,
      dice: sorted,
    };
  }
  if (singleton === 2) {
    return {
      rollName: pickVariant("SHORTLY! 👶", "JIT! 👶"),
      result: "point",
      point: 2,
      dice: sorted,
    };
  }

  return { rollName: "No Count - Roll Again", result: "no_count", dice: sorted };
}

/**
 * Compare point totals. Tie goes to the banker (street C-Lo).
 */
export function comparePoints(
  bankerPoint: number,
  playerPoint: number
): "player_wins" | "banker_wins" {
  if (playerPoint > bankerPoint) return "player_wins";
  return "banker_wins";
}

export function calculatePayout(
  betCents: number,
  feePct: number = 10
): {
  grossPayout: number;
  platformFee: number;
  netPayout: number;
} {
  const grossPayout = betCents * 2;
  const platformFee = Math.floor((grossPayout * feePct) / 100);
  const netPayout = grossPayout - platformFee;
  return { grossPayout, platformFee, netPayout };
}

export function getSideBetOdds(betType: string): number {
  const odds: Record<string, number> = {
    next_roll_celo: 8.0,
    next_roll_shit: 8.0,
    next_roll_handcrack: 4.5,
    next_roll_trips: 8.0,
    banker_wins: 1.8,
    players_win: 1.8,
    specific_point: 6.0,
  };
  return odds[betType] ?? 2.0;
}

export function getTierBetLimitCents(tier: string): number {
  const limits: Record<string, number> = {
    free: 1000,
    starter: 5000,
    growth: 25000,
    pro: 100000,
    elite: 999_999_999,
  };
  return limits[tier] ?? limits.free;
}
