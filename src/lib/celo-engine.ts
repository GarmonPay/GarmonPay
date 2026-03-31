/**
 * C-Lo (street dice) game engine — SERVER ONLY.
 * Use from API routes / Node; never import in client bundles for dice logic.
 */

import { randomInt } from "node:crypto";

export type RollResultKind = "instant_win" | "instant_loss" | "point" | "no_count";

export function rollThreeDice(): [number, number, number] {
  // crypto.randomInt(min, max) — max is EXCLUSIVE
  const d1 = randomInt(1, 7);
  const d2 = randomInt(1, 7);
  const d3 = randomInt(1, 7);
  if (process.env.NODE_ENV !== "production") {
    console.log("[celo-engine] Server dice roll:", d1, d2, d3);
  }
  return [d1, d2, d3];
}

export function evaluateRoll(dice: [number, number, number]): {
  rollName: string;
  result: RollResultKind;
  point?: number;
  dice: number[];
} {
  const [a0, b0, c0] = dice;
  const sorted = [...dice].sort((x, y) => x - y);
  const [s1, s2, s3] = sorted as [number, number, number];

  // ── INSTANT WINS ──

  if (s1 === 4 && s2 === 5 && s3 === 6) {
    return { rollName: "C-LO! 🎲", result: "instant_win", dice: sorted };
  }

  if (s1 === s2 && s2 === s3) {
    const names: Record<number, string> = {
      1: "ACE OUT! 🎲",
      2: "TRIP DEUCES! 🎲",
      3: "TRIP THREES! 🎲",
      4: "TRIP FOURS! 🎲",
      5: "TRIP FIVES! 🎲",
      6: "TRIP SIXES - THE BOSS! 👑",
    };
    return { rollName: names[s1] ?? "TRIPS! 🎲", result: "instant_win", dice: sorted };
  }

  if (
    (a0 === b0 && c0 === 6 && a0 !== 6) ||
    (a0 === c0 && b0 === 6 && a0 !== 6) ||
    (b0 === c0 && a0 === 6 && b0 !== 6)
  ) {
    return { rollName: "HAND CRACK! 💥", result: "instant_win", dice: sorted };
  }

  // ── INSTANT LOSSES ──

  if (s1 === 1 && s2 === 2 && s3 === 3) {
    return { rollName: "SHIT! 💩", result: "instant_loss", dice: sorted };
  }

  if (
    (a0 === b0 && c0 === 1 && a0 !== 1) ||
    (a0 === c0 && b0 === 1 && a0 !== 1) ||
    (b0 === c0 && a0 === 1 && b0 !== 1)
  ) {
    return { rollName: "DICK! 😂", result: "instant_loss", dice: sorted };
  }

  // ── POINTS (pair + odd kicker) ──

  let pairValue: number | null = null;
  let oddValue: number | null = null;

  if (a0 === b0 && c0 !== a0) {
    pairValue = a0;
    oddValue = c0;
  } else if (a0 === c0 && b0 !== a0) {
    pairValue = a0;
    oddValue = b0;
  } else if (b0 === c0 && a0 !== b0) {
    pairValue = b0;
    oddValue = a0;
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
        rollName: name,
        result: "point",
        point: oddValue,
        dice: sorted,
      };
    }
  }

  return {
    rollName: "No Count — Roll Again",
    result: "no_count",
    dice: sorted,
  };
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

/**
 * Resolve player roll vs banker when round is in `player_rolling` (banker established a point).
 */
export function resolvePlayerRoundOutcome(
  playerEv: { result: RollResultKind; point?: number },
  bankerRollResult: RollResultKind | null | undefined,
  bankerPoint: number | null | undefined
): "win" | "loss" {
  if (playerEv.result === "instant_win") return "win";
  if (playerEv.result === "instant_loss") return "loss";
  if (playerEv.result === "no_count") return "loss";
  if (playerEv.result === "point") {
    if (
      bankerRollResult === "point" &&
      typeof bankerPoint === "number" &&
      typeof playerEv.point === "number"
    ) {
      return comparePoints(bankerPoint, playerEv.point) === "player_wins" ? "win" : "loss";
    }
    return "loss";
  }
  return "loss";
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
