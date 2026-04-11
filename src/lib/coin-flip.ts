import { randomInt } from "crypto";

export type CoinSide = "heads" | "tails";

/** Coin flip stakes use Sweeps Coins; minimum bet (SC). */
export const COIN_FLIP_MIN_BET_SC = 100;

/** Total pot is 2× bet; winner receives 90%; house keeps 10%. */
export function computePayoutAndHouseCut(betMinor: number): { payoutWinnerMinor: number; houseCutMinor: number } {
  const bet = Math.floor(Number(betMinor));
  const totalPot = bet * 2;
  const payoutWinnerMinor = Math.floor((totalPot * 90) / 100);
  const houseCutMinor = totalPot - payoutWinnerMinor;
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
