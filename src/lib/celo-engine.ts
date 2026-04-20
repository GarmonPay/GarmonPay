import { randomInt } from "crypto";

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export type RollResult = {
  dice: [DiceValue, DiceValue, DiceValue];
  rollName: string;
  result: "instant_win" | "instant_loss" | "point" | "no_count";
  point?: number;
  isCelo: boolean;
};

export function rollThreeDice(): [DiceValue, DiceValue, DiceValue] {
  return [
    randomInt(1, 7) as DiceValue,
    randomInt(1, 7) as DiceValue,
    randomInt(1, 7) as DiceValue,
  ];
}

export function evaluateRoll(dice: [DiceValue, DiceValue, DiceValue]): RollResult {
  const [a, b, c] = dice;
  const sorted = [...dice].sort((x, y) => x - y);
  const [s1, s2, s3] = sorted;

  if (s1 === 4 && s2 === 5 && s3 === 6) {
    return { dice, rollName: "C-LO! 🎲", result: "instant_win", isCelo: true };
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
    return { dice, rollName: names[s1], result: "instant_win", isCelo: false };
  }

  let pairVal: number | null = null;
  let oddVal: number | null = null;
  if (a === b && c !== a) {
    pairVal = a;
    oddVal = c;
  } else if (a === c && b !== a) {
    pairVal = a;
    oddVal = b;
  } else if (b === c && a !== b) {
    pairVal = b;
    oddVal = a;
  }

  if (pairVal !== null && oddVal !== null) {
    if (oddVal === 6) {
      return { dice, rollName: "HAND CRACK! 💥", result: "instant_win", isCelo: false };
    }
    if (oddVal === 1) {
      return { dice, rollName: "DICK! 😂", result: "instant_loss", isCelo: false };
    }
    const pointNames: Record<number, string[]> = {
      5: ["POUND! 🔵", "POLICE! 🚔"],
      4: ["ZOE! 🇭🇹", "HAITIAN! 🇭🇹"],
      3: ["GIRL! 👧", "HOE! 😅"],
      2: ["SHORTLY! 👶", "JIT! 👶"],
    };
    if (pointNames[oddVal]) {
      const name = pointNames[oddVal][randomInt(0, 2)];
      return { dice, rollName: name, result: "point", point: oddVal, isCelo: false };
    }
  }

  if (s1 === 1 && s2 === 2 && s3 === 3) {
    return { dice, rollName: "SHIT! 💩", result: "instant_loss", isCelo: false };
  }

  return { dice, rollName: "No Count — Roll Again 🎲", result: "no_count", isCelo: false };
}

export function calculatePayout(entrySC: number, feePct = 10) {
  const gross = entrySC * 2;
  const fee = Math.floor((gross * feePct) / 100);
  return { gross, fee, net: gross - fee };
}

export function validateEntry(amount: number, minimum: number) {
  if (amount < minimum) return { valid: false as const, error: `Minimum entry is ${minimum} GPC` };
  if (amount % minimum !== 0) return { valid: false as const, error: `Entry must be a multiple of ${minimum} GPC` };
  return { valid: true as const };
}

/** Higher point beats lower; ties go to banker. */
export function comparePointToBanker(playerPoint: number, bankerPoint: number): "player" | "banker" {
  if (playerPoint > bankerPoint) return "player";
  return "banker";
}

export function diceFromInts(a: number, b: number, c: number): [DiceValue, DiceValue, DiceValue] {
  const clamp = (n: number) => Math.min(6, Math.max(1, Math.floor(n))) as DiceValue;
  return [clamp(a), clamp(b), clamp(c)];
}
