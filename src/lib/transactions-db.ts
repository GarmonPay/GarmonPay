/**
 * Transactions and ad credit — Supabase. All balance changes server-side.
 */

import { createAdminClient } from "@/lib/supabase";

export type TransactionType =
  | "earning"
  | "withdrawal"
  | "ad_credit"
  | "referral"
  | "referral_commission"
  | "deposit"
  | "adjustment";
export type TransactionStatus = "pending" | "completed" | "rejected" | "cancelled";

export interface TransactionRow {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

/** Convert balance to ad credit. Deducts balance, adds ad_credit_balance, inserts transaction. */
export async function convertBalanceToAdCredit(
  userId: string,
  amountCents: number
): Promise<{ success: true; amountCents: number } | { success: false; message: string }> {
  const { data, error } = await supabase().rpc("convert_balance_to_ad_credit", {
    p_user_id: userId,
    p_amount_cents: amountCents,
  });
  if (error) return { success: false, message: error.message };
  const result = data as { success: boolean; message?: string; amountCents?: number };
  if (result.success && typeof result.amountCents === "number") {
    return { success: true, amountCents: result.amountCents };
  }
  return { success: false, message: (result as { message?: string }).message ?? "Failed" };
}

/** List transactions for a user (newest first). */
export async function listTransactionsByUser(userId: string): Promise<TransactionRow[]> {
  const { data, error } = await supabase()
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransactionRow[];
}

/** Get user balance and ad_credit_balance. */
export async function getUserBalances(userId: string): Promise<{
  balance: number;
  ad_credit_balance: number;
} | null> {
  const { data, error } = await supabase()
    .from("users")
    .select("balance, ad_credit_balance")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    balance: Number(data.balance ?? 0),
    ad_credit_balance: Number((data as { ad_credit_balance?: number }).ad_credit_balance ?? 0),
  };
}

/** Totals from transactions for a user: total earnings, total withdrawn, total deposits. */
export async function getTotalsForUser(userId: string): Promise<{
  totalEarningsCents: number;
  totalWithdrawnCents: number;
  totalAdCreditConvertedCents: number;
  totalDepositsCents: number;
}> {
  const { data, error } = await supabase()
    .from("transactions")
    .select("type, amount, status")
    .eq("user_id", userId);
  if (error) throw error;
  const rows = (data ?? []) as { type: string; amount: number; status: string }[];
  let totalEarningsCents = 0;
  let totalWithdrawnCents = 0;
  let totalAdCreditConvertedCents = 0;
  let totalDepositsCents = 0;
  const earningTypes = ["earning", "referral", "referral_commission", "spin_wheel", "scratch_card", "mystery_box", "streak", "mission", "tournament_prize", "team_prize"];
  for (const r of rows) {
    const amt = Number(r.amount);
    if (r.type === "deposit" && r.status === "completed") {
      totalDepositsCents += amt;
    } else if (earningTypes.includes(r.type)) {
      if (r.status === "completed") totalEarningsCents += amt;
    } else if (r.type === "withdrawal") {
      if (r.status === "completed" || r.status === "pending") totalWithdrawnCents += amt;
    } else if (r.type === "ad_credit") {
      if (r.status === "completed") totalAdCreditConvertedCents += amt;
    }
  }
  return { totalEarningsCents, totalWithdrawnCents, totalAdCreditConvertedCents, totalDepositsCents };
}

/** Mark withdrawal transaction as completed (when admin marks paid). */
export async function markWithdrawalTransactionCompleted(withdrawalId: string): Promise<void> {
  await markWithdrawalTransactionStatus(withdrawalId, "completed", "Withdrawal paid");
}

/** Update withdrawal transaction status by withdrawal reference_id. */
export async function markWithdrawalTransactionStatus(
  withdrawalId: string,
  status: "pending" | "completed" | "rejected" | "cancelled",
  description?: string
): Promise<void> {
  await supabase()
    .from("transactions")
    .update({
      status,
      ...(description ? { description } : {}),
    })
    .eq("reference_id", withdrawalId)
    .eq("type", "withdrawal");
}

/** Admin: list all transactions (with optional user filter). */
export async function listAllTransactions(): Promise<(TransactionRow & { user_email?: string })[]> {
  const { data, error } = await supabase()
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as TransactionRow[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const emails = new Map<string, string>();
  for (const uid of userIds) {
    const { data: u } = await supabase().from("users").select("email").eq("id", uid).single();
    if (u?.email) emails.set(uid, u.email as string);
  }
  return rows.map((r) => ({ ...r, user_email: emails.get(r.user_id) }));
}

/** Admin: platform totals (deposits, withdrawals, earnings, ad credit). */
export async function getPlatformTotals(): Promise<{
  totalDepositsCents: number;
  totalWithdrawalsCents: number;
  totalEarningsCents: number;
  totalAdCreditCents: number;
}> {
  const { data, error } = await supabase()
    .from("transactions")
    .select("type, amount, status");
  if (error) throw error;
  const rows = (data ?? []) as { type: string; amount: number; status: string }[];
  let totalDepositsCents = 0;
  let totalWithdrawalsCents = 0;
  let totalEarningsCents = 0;
  let totalAdCreditCents = 0;
  const earningTypes = ["earning", "referral", "referral_commission", "spin_wheel", "scratch_card", "mystery_box", "streak", "mission", "tournament_prize", "team_prize"];
  for (const r of rows) {
    const amt = Number(r.amount);
    if (r.type === "deposit" && r.status === "completed") {
      totalDepositsCents += amt;
    } else if (r.type === "withdrawal" && r.status !== "rejected") {
      totalWithdrawalsCents += amt;
    } else if (earningTypes.includes(r.type) && r.status === "completed") {
      totalEarningsCents += amt;
    } else if (r.type === "ad_credit" && r.status === "completed") {
      totalAdCreditCents += amt;
    }
  }
  return { totalDepositsCents, totalWithdrawalsCents, totalEarningsCents, totalAdCreditCents };
}
