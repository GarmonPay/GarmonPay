/*
 * CORE FILE — DO NOT MODIFY WITHOUT EXPLICIT INSTRUCTION.
 * CRITICAL FOR PLATFORM SECURITY.
 */

/**
 * Protected payment service. Handle ONLY: balance updates, advertiser balance, withdrawals.
 * No UI code.
 */

import { getUserBalances, convertBalanceToAdCredit } from "@/lib/transactions-db";
import {
  submitWithdrawal,
  listWithdrawalsByUser,
  MIN_WITHDRAWAL_CENTS,
  type WithdrawalMethod,
  type WithdrawalRow,
} from "@/lib/withdrawals-db";

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

export { MIN_WITHDRAWAL_CENTS };

/** Submit withdrawal request. */
export async function createWithdrawal(
  userId: string,
  amountCents: number,
  method: WithdrawalMethod,
  walletAddress: string
): Promise<
  | { success: true; withdrawal: WithdrawalRow }
  | { success: false; message: string }
> {
  return submitWithdrawal(userId, amountCents, method, walletAddress);
}

/** List withdrawals for a user. */
export async function getWithdrawals(userId: string): Promise<WithdrawalRow[]> {
  return listWithdrawalsByUser(userId);
}
