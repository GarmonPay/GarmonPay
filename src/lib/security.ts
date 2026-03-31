/**
 * Shared security constants and helpers.
 * Use for validation across API routes.
 */

/** Max single payment/checkout amount in cents ($10,000). */
export const MAX_PAYMENT_CENTS = 1_000_000;

/** Min wallet deposit / add-funds in cents ($5). */
export const MIN_WALLET_FUND_CENTS = 500;

/** Min checkout amount in cents ($0.50). */
export const MIN_PAYMENT_CENTS = 50;

/** Max wallet address / payout identifier length. */
export const MAX_WALLET_ADDRESS_LENGTH = 500;

/** Sanitize string for storage: trim, limit length, remove null bytes. */
export function sanitizeString(
  value: unknown,
  maxLength: number = 1000
): string {
  if (value == null) return "";
  const s = String(value).replace(/\0/g, "").trim();
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

/** Validate and sanitize wallet/payout address. */
export function sanitizeWalletAddress(value: unknown): string {
  const s = sanitizeString(value, MAX_WALLET_ADDRESS_LENGTH);
  // Strip any HTML/script-like content
  return s.replace(/<[^>]*>/g, "");
}
