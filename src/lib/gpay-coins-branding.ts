import { scToUsdDisplay } from "@/lib/coins";
import { safeFiniteInt } from "@/lib/format-number";

/** Full marketing name — “I won 5,000 GPay Coins on GarmonPay!” */
export const GPAY_COINS_NAME = "GPay Coins";

/** Ticker used in UI where space is tight (replaces legacy “SC”). */
export const GPAY_COINS_TICKER = "GPC";

/** Social / campaign tag */
export const GPAY_COINS_HASHTAG = "#GPayCoins";

/** On-chain reward asset (copy only; product rules apply). */
export const GPAY_TOKEN_DISPLAY = "$GPAY";

/**
 * Primary balance line: amount + face value in USD.
 * Example: `5,000 GPC ($50.00)`
 */
export function formatGpcWithUsd(amount: number | null | undefined): string {
  const n = safeFiniteInt(amount);
  return `${n.toLocaleString()} ${GPAY_COINS_TICKER} (${scToUsdDisplay(n)})`;
}

/** Amount + ticker only, e.g. `5,000 GPC` */
export function formatGpcAmount(amount: number | null | undefined): string {
  const n = safeFiniteInt(amount);
  return `${n.toLocaleString()} ${GPAY_COINS_TICKER}`;
}

/** Amount + `$GPAY` + USD face (no “SC” / “GPC” / “Sweeps”). */
export function formatGpayWithUsd(amount: number): string {
  const n = safeFiniteInt(amount);
  return `${n.toLocaleString()} $GPAY (${scToUsdDisplay(n)})`;
}

/** Balance lines: amount + `$GPAY` only (no USD). */
export function formatGpayAmount(amount: number): string {
  const n = safeFiniteInt(amount);
  return `${n.toLocaleString()} $GPAY`;
}
