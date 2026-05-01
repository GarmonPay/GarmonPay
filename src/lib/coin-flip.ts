import { randomInt } from "crypto";

export type CoinSide = "heads" | "tails";

/** Coin flip stakes use GPay Coins; minimum bet (GPC). */
export const COIN_FLIP_MIN_BET_SC = 100;

/** PvP only: total pot = both stakes; fee = 10% of pot taken from pot; winner gets remainder. */
export function computePvpCoinFlipSettlement(betPerPlayerGpc: number): {
  totalPotGpc: number;
  platformFeeGpc: number;
  winnerPayoutGpc: number;
} {
  const bet = Math.floor(Number(betPerPlayerGpc));
  const totalPotGpc = bet * 2;
  const platformFeeGpc = Math.floor(totalPotGpc * 0.1);
  const winnerPayoutGpc = totalPotGpc - platformFeeGpc;
  return { totalPotGpc, platformFeeGpc, winnerPayoutGpc };
}

/** @deprecated use computePvpCoinFlipSettlement; kept for call sites that expect { payoutWinnerMinor, houseCutMinor }. */
export function computePayoutAndHouseCut(betMinor: number): { payoutWinnerMinor: number; houseCutMinor: number } {
  const s = computePvpCoinFlipSettlement(betMinor);
  return { payoutWinnerMinor: s.winnerPayoutGpc, houseCutMinor: s.platformFeeGpc };
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

/** GPay wagered into a completed PvP flip (both players staked the same per-player bet). */
export function coinFlipPvpTotalWageredMinor(betPerPlayerMinor: number): number {
  return Math.floor(Number(betPerPlayerMinor)) * 2;
}
