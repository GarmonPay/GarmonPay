/*
 * CORE FILE — DO NOT MODIFY WITHOUT EXPLICIT INSTRUCTION.
 * CRITICAL FOR PLATFORM SECURITY.
 */

/**
 * Protected payment service. Handle ONLY: balance updates, advertiser balance, ad credit conversion.
 * No UI code.
 */

import { getUserBalances, convertBalanceToAdCredit } from "@/lib/transactions-db";

/** Get user balance (main balance in cents). */
export async function getBalance(userId: string): Promise<number> {
  const result = await getUserBalances(userId);
  return result ? result.balance : 0;
}

/** Get user advertiser/ad credit balance in cents. */
export async function getAdvertiserBalance(userId: string): Promise<number> {
  const result = await getUserBalances(userId);
  return result ? result.ad_credit_balance : 0;
}

/** Convert main balance to ad credit. */
export async function convertToAdCredit(
  userId: string,
  amountCents: number
): Promise<{ success: true; amountCents: number } | { success: false; message: string }> {
  return convertBalanceToAdCredit(userId, amountCents);
}
