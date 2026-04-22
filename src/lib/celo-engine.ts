import { randomInt } from "crypto";

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type RollResult = "instant_win" | "instant_loss" | "point" | "no_count";

export interface EvaluatedRoll {
  dice: [DiceValue, DiceValue, DiceValue];
  rollName: string;
  result: RollResult;
  point: number | null;
  isCelo: boolean;
  isTrips: boolean;
}

export function rollThreeDice(): [DiceValue, DiceValue, DiceValue] {
  return [
    randomInt(1, 7) as DiceValue,
    randomInt(1, 7) as DiceValue,
    randomInt(1, 7) as DiceValue,
  ];
}

export function evaluateRoll(
  dice: [DiceValue, DiceValue, DiceValue]
): EvaluatedRoll {
  const sorted = [...dice].sort((a, b) => a - b) as [
    DiceValue,
    DiceValue,
    DiceValue,
  ];
  const [a, b, c] = sorted;

  // C-Lo 4-5-6
  if (a === 4 && b === 5 && c === 6) {
    return {
      dice,
      rollName: "C-LO! 🎲",
      result: "instant_win",
      point: null,
      isCelo: true,
      isTrips: false,
    };
  }

  // Trips
  if (a === b && b === c) {
    const names: Record<number, string> = {
      1: "ACE OUT! 🎲",
      2: "TRIP DEUCES! 🎲",
      3: "TRIP THREES! 🎲",
      4: "TRIP FOURS! 🎲",
      5: "TRIP FIVES! 🎲",
      6: "TRIP SIXES - THE BOSS! 👑",
    };
    return {
      dice,
      rollName: names[a] ?? "TRIPS! 🎲",
      result: "instant_win",
      point: null,
      isCelo: false,
      isTrips: true,
    };
  }

  // Pair + odd
  let pair: number | null = null;
  let odd: number | null = null;
  if (a === b) {
    pair = a;
    odd = c;
  } else if (b === c) {
    pair = b;
    odd = a;
  } else if (a === c) {
    pair = a;
    odd = b;
  }

  if (pair !== null && odd !== null) {
    if (odd === 6) {
      return {
        dice,
        rollName: "HAND CRACK! 💥",
        result: "instant_win",
        point: null,
        isCelo: false,
        isTrips: false,
      };
    }
    if (odd === 1) {
      return {
        dice,
        rollName: "DICK! 😂",
        result: "instant_loss",
        point: null,
        isCelo: false,
        isTrips: false,
      };
    }
    const pointNames: Record<number, [string, string]> = {
      5: ["POUND! 🔵", "POLICE! 🚔"],
      4: ["ZOE! 🇭🇹", "HAITIAN! 🇭🇹"],
      3: ["GIRL! 👧", "HOE! 😅"],
      2: ["SHORTLY! 👶", "JIT! 👶"],
    };
    if (pointNames[odd]) {
      const [n0, n1] = pointNames[odd];
      const name = [n0, n1][randomInt(0, 2)];
      return {
        dice,
        rollName: name,
        result: "point",
        point: odd,
        isCelo: false,
        isTrips: false,
      };
    }
  }

  // Shit 1-2-3
  if (a === 1 && b === 2 && c === 3) {
    return {
      dice,
      rollName: "SHIT! 💩",
      result: "instant_loss",
      point: null,
      isCelo: false,
      isTrips: false,
    };
  }

  // No count
  return {
    dice,
    rollName: "No Count 🎲",
    result: "no_count",
    point: null,
    isCelo: false,
    isTrips: false,
  };
}

export function calculatePayout(entrySC: number, feePct = 10) {
  const gross = entrySC * 2;
  const fee = Math.floor((gross * feePct) / 100);
  return { gross, fee, net: gross - fee };
}

export function validateEntry(amount: number, minimum: number) {
  if (amount < minimum) {
    return {
      valid: false,
      error: `Minimum entry is ${minimum} GPC`,
    };
  }
  if (amount % minimum !== 0) {
    return {
      valid: false,
      error: `Entry must be a multiple of ${minimum} GPC`,
    };
  }
  return { valid: true, error: null as string | null };
}

export function comparePoints(
  playerPoint: number,
  bankerPoint: number
): "win" | "loss" {
  return playerPoint > bankerPoint ? "win" : "loss";
}
