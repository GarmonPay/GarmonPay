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

function clampDie(n: number): DiceValue {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  if (v > 6) return 6;
  return v as DiceValue;
}

export function evaluateRoll(
  dice: [DiceValue, DiceValue, DiceValue]
): EvaluatedRoll {
  const normalized = [
    clampDie(dice[0]),
    clampDie(dice[1]),
    clampDie(dice[2]),
  ] as [DiceValue, DiceValue, DiceValue];
  const sorted = [...normalized].sort((a, b) => a - b) as [
    DiceValue,
    DiceValue,
    DiceValue,
  ];
  const [a, b, c] = sorted;

  const logResult = (out: EvaluatedRoll): EvaluatedRoll => {
    console.log("[C-Lo Roll Classification]", {
      dice: [dice[0], dice[1], dice[2]],
      sorted: [a, b, c],
      result: { rollName: out.rollName, result: out.result },
    });
    return out;
  };

  // Any order 1-2-3 → automatic loss (must run before pair/trips logic)
  if (a === 1 && b === 2 && c === 3) {
    return logResult({
      dice,
      rollName: "DICK • AUTOMATIC LOSS",
      result: "instant_loss",
      point: null,
      isCelo: false,
      isTrips: false,
    });
  }

  // Any order 4-5-6 → C-Lo (automatic win)
  if (a === 4 && b === 5 && c === 6) {
    return logResult({
      dice,
      rollName: "C-Lo",
      result: "instant_win",
      point: null,
      isCelo: true,
      isTrips: false,
    });
  }

  // Trips
  if (a === b && b === c) {
    return logResult({
      dice,
      rollName: "Trips",
      result: "instant_win",
      point: null,
      isCelo: false,
      isTrips: true,
    });
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
      return logResult({
        dice,
        rollName: "Head Crack",
        result: "instant_win",
        point: null,
        isCelo: false,
        isTrips: false,
      });
    }
    if (odd === 1) {
      return logResult({
        dice,
        rollName: "Dick",
        result: "instant_loss",
        point: null,
        isCelo: false,
        isTrips: false,
      });
    }
    const pointNameByOdd: Record<number, string> = {
      2: "Shorty",
      3: "Girl",
      4: "Zoe",
      5: "Pound",
    };
    if (pointNameByOdd[odd]) {
      return logResult({
        dice,
        rollName: pointNameByOdd[odd]!,
        result: "point",
        point: odd,
        isCelo: false,
        isTrips: false,
      });
    }
  }

  // No count
  return logResult({
    dice,
    rollName: "No Count",
    result: "no_count",
    point: null,
    isCelo: false,
    isTrips: false,
  });
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

/**
 * Player table stake: any whole GPC from room minimum up to the current bank (not limited to min multiples).
 */
export function validatePlayerStake(
  stakeSc: number,
  minEntrySc: number,
  currentBankSc: number
): { valid: boolean; error: string | null } {
  if (!Number.isInteger(stakeSc) || !Number.isFinite(stakeSc) || stakeSc <= 0) {
    return { valid: false, error: "Bet must be a positive whole number of GPC." };
  }
  if (stakeSc < minEntrySc) {
    return { valid: false, error: "Bet must be at least the room minimum." };
  }
  if (currentBankSc <= 0) {
    return { valid: false, error: "Table bank is empty." };
  }
  if (stakeSc > currentBankSc) {
    return { valid: false, error: "Bet cannot exceed the current bank." };
  }
  return { valid: true, error: null };
}

export function comparePoints(
  playerPoint: number,
  bankerPoint: number
): "win" | "loss" {
  return playerPoint > bankerPoint ? "win" : "loss";
}
