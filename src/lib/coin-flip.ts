import { randomInt } from "crypto";

export type CoinSide = "heads" | "tails";

/** Coin flip stakes use GPay Coins; minimum bet (GPC). */
export const COIN_FLIP_MIN_BET_SC = 100;

/** Total pot is 2× bet; platform fee is 10% of gross; winner receives gross − fee. */
export function computePayoutAndHouseCut(betMinor: number): { payoutWinnerMinor: number; houseCutMinor: number } {
  const bet = Math.floor(Number(betMinor));
  const gross = bet * 2;
  const platformFee = Math.floor(gross * 0.1);
  const payoutWinnerMinor = gross - platformFee;
  const houseCutMinor = platformFee;
  return { payoutWinnerMinor, houseCutMinor };
}

export function flipCoin(): CoinSide {
  return randomInt(0, 2) === 0 ? "heads" : "tails";
}

export function maskCreatorEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "Player";
  const at = email.indexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length <= 1) return `•••@${domain}`;
  return `${local[0]}•••@${domain}`;
}

/** GPay wagered into the game (creator + opponent stakes where applicable). */
export function totalWageredMinor(mode: "vs_house" | "vs_player", betMinor: number): number {
  const b = Math.floor(betMinor);
  return mode === "vs_house" ? b : b * 2;
}
