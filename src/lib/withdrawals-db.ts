/**
 * Withdrawals — Supabase. Submit deducts balance; reject refunds.
 */

import { createAdminClient } from "@/lib/supabase";

export const MIN_WITHDRAWAL_CENTS = 100; // $1

export type WithdrawalStatus = "pending" | "approved" | "rejected" | "paid";
export type WithdrawalMethod = "crypto" | "paypal" | "bank";

export interface WithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  method: string;
  wallet_address: string;
  created_at: string;
}

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

/** Submit withdrawal: deducts balance and creates pending record. Uses DB function. */
export async function submitWithdrawal(
  userId: string,
  amountCents: number,
  method: WithdrawalMethod,
  walletAddress: string
): Promise<
  | { success: true; withdrawal: WithdrawalRow }
  | { success: false; message: string }
> {
  const { data, error } = await supabase().rpc("submit_withdrawal", {
    p_user_id: userId,
    p_amount: amountCents,
    p_method: method,
    p_wallet_address: walletAddress.trim(),
    p_min_amount: MIN_WITHDRAWAL_CENTS,
  });
  if (error) return { success: false, message: error.message };
  const result = data as { success: boolean; message?: string; withdrawal?: WithdrawalRow };
  if (result.success && result.withdrawal) {
    return { success: true, withdrawal: result.withdrawal };
  }
  return { success: false, message: (result as { message?: string }).message ?? "Failed" };
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

/** Update withdrawal status (approve, paid). Reject uses rejectWithdrawal to refund. */
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
