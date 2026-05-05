/** 1 GC = 100 GPC nominal, 3% platform fee → 97 GPC credited per GC. */
export const GC_TO_GPC_RATE = 97;
/** 3% platform fee on nominal 100 GPC per GC. */
export const PLATFORM_FEE_PCT = 0.03;
/** Nominal GPC per 1 GC before fee (100). */
export const GC_TO_GPC_NOMINAL = 100;

/** User-facing rate line for wallet / marketing. */
export const GC_TO_GPC_RATE_DISPLAY = "1 GC = 97 GPC (3% fee)";

/** Integer GPC received for a whole GC amount (same formula as `convert_gold_to_gpay_coins`). */
export function gpcReceivedFromGc(gcAmount: number): number {
  const gc = Math.floor(Number(gcAmount));
  if (!Number.isFinite(gc) || gc < 0) return 0;
  return gc * GC_TO_GPC_RATE;
}

/** Platform fee in GPC for the conversion (3 GPC per GC). */
export function gpcPlatformFeeFromGc(gcAmount: number): number {
  const gc = Math.floor(Number(gcAmount));
  if (!Number.isFinite(gc) || gc < 0) return 0;
  return gc * (GC_TO_GPC_NOMINAL - GC_TO_GPC_RATE);
}
