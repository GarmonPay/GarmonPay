/**
 * Withdrawals — Supabase. Safe withdrawal: withdrawable_balance, 10% fee, fraud limits, platform revenue.
 */

import { createAdminClient } from "@/lib/supabase";

export const MIN_WITHDRAWAL_CENTS = 1000; // $10 minimum

export type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";
export type WithdrawalMethod = "crypto" | "paypal" | "bank";

export interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  platform_fee?: number;
  net_amount?: number;
  status: string;
  method: string;
  wallet_address: string;
  created_at: string;
  processed_at?: string | null;
  ip_address?: string | null;
}

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

/** Request withdrawal: checks withdrawable_balance, min $10, 10% fee, fraud limits (3/day, 5min), logs IP. */
export async function requestWithdrawal(
  userId: string,
  amountCents: number,
  method: WithdrawalMethod,
  walletAddress: string,
  ipAddress?: string | null
): Promise<
  | { success: true; withdrawal: WithdrawalRow }
  | { success: false; message: string }
> {
  const { data, error } = await supabase().rpc("request_withdrawal", {
    p_user_id: userId,
    p_amount_cents: amountCents,
    p_method: method,
    p_wallet_address: walletAddress.trim(),
    p_ip_address: ipAddress ?? null,
  });
  if (error) return { success: false, message: error.message };
  const result = data as { success: boolean; message?: string; withdrawal?: WithdrawalRow };
  if (result.success && result.withdrawal) {
    return { success: true, withdrawal: result.withdrawal };
  }
  return { success: false, message: (result as { message?: string }).message ?? "Failed" };
}

/** @deprecated Use requestWithdrawal. Kept for compatibility. */
export async function submitWithdrawal(
  userId: string,
  amountCents: number,
  method: WithdrawalMethod,
  walletAddress: string,
  ipAddress?: string | null
): Promise<
  | { success: true; withdrawal: WithdrawalRow }
  | { success: false; message: string }
> {
  return requestWithdrawal(userId, amountCents, method, walletAddress, ipAddress);
}

/** Reject withdrawal: refunds balance, sets status rejected. */
export async function rejectWithdrawal(withdrawalId: string): Promise<{ success: boolean; message?: string }> {
  const { data, error } = await supabase().rpc("reject_withdrawal", { p_withdrawal_id: withdrawalId });
  if (error) return { success: false, message: error.message };
  const result = data as { success: boolean; message?: string };
  return { success: result.success, message: result.message };
}

/** List withdrawals for a user. */
export async function listWithdrawalsByUser(userId: string): Promise<WithdrawalRow[]> {
  const { data, error } = await supabase()
    .from("withdrawals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as WithdrawalRow[];
}

/** List all withdrawals for admin (with user email). */
export async function listAllWithdrawals(): Promise<
  (WithdrawalRow & { user_email?: string })[]
> {
  const { data, error } = await supabase()
    .from("withdrawals")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as WithdrawalRow[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const emails = new Map<string, string>();
  for (const uid of userIds) {
    const { data: u } = await supabase().from("users").select("email").eq("id", uid).single();
    if (u?.email) emails.set(uid, u.email as string);
  }
  return rows.map((r) => ({ ...r, user_email: emails.get(r.user_id) }));
}

/** Approve withdrawal: sets status approved, processed_at, records platform_revenue (withdrawal_fee). */
export async function approveWithdrawal(withdrawalId: string): Promise<{ success: boolean; message?: string; withdrawal?: WithdrawalRow }> {
  const { data, error } = await supabase().rpc("approve_withdrawal", { p_withdrawal_id: withdrawalId });
  if (error) return { success: false, message: error.message };
  const result = data as { success: boolean; message?: string; withdrawal?: WithdrawalRow };
  if (result.success && result.withdrawal) {
    return { success: true, withdrawal: result.withdrawal };
  }
  return { success: false, message: (result as { message?: string }).message ?? "Approve failed" };
}

/** Update withdrawal status to paid (after approve). Reject uses rejectWithdrawal; approve uses approveWithdrawal. */
export async function updateWithdrawalStatus(
  withdrawalId: string,
  status: WithdrawalStatus
): Promise<WithdrawalRow | null> {
  if (status === "rejected") return null;
  const { data, error } = await supabase()
    .from("withdrawals")
    .update({ status })
    .eq("id", withdrawalId)
    .in("status", ["pending", "approved"])
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as WithdrawalRow | null;
}
