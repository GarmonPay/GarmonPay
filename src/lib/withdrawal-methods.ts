/**
 * Withdrawal method strings for `public.request_withdrawal` (no server imports — safe for client).
 */

export const WITHDRAWAL_METHOD_VALUES = ["gpay_tokens", "bank_transfer", "cashapp", "paypal"] as const;
export type WithdrawalMethod = (typeof WITHDRAWAL_METHOD_VALUES)[number];

/** Map legacy client/API strings to RPC method names. */
export function normalizeWithdrawalMethod(input: string | undefined | null): WithdrawalMethod | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (s === "crypto") return "gpay_tokens";
  if (s === "bank") return "bank_transfer";
  if ((WITHDRAWAL_METHOD_VALUES as readonly string[]).includes(s)) return s as WithdrawalMethod;
  return null;
}
