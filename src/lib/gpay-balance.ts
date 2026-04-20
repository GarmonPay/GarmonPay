import { createAdminClient } from "@/lib/supabase";
import { creditCoins, debitGpayCoins } from "@/lib/coins";

export async function getGPayBalance(userId: string): Promise<number> {
  const supabase = createAdminClient();
  if (!supabase) return 0;
  const { data } = await supabase
    .from("users")
    .select("gpay_coins")
    .eq("id", userId)
    .maybeSingle();
  return Number((data as { gpay_coins?: number } | null)?.gpay_coins ?? 0);
}

type GPayMeta = { description?: string; reference?: string };

/**
 * Debit `users.gpay_coins` via `process_game_loss` RPC (atomic debit + coin_transactions).
 */
export async function deductGPay(
  userId: string,
  amount: number,
  currentBalance?: number,
  meta?: GPayMeta
): Promise<{ ok: boolean; message?: string }> {
  void currentBalance;
  const ref = meta?.reference ?? `gpay_deduct_${userId}_${Date.now()}`;
  const desc = meta?.description ?? "C-Lo GPay Coins";
  const r = await debitGpayCoins(userId, amount, desc, ref);
  if (!r.success) {
    return { ok: false, message: r.message ?? "Insufficient GPay Coins" };
  }
  return { ok: true };
}

export async function creditGPay(
  userId: string,
  amount: number,
  meta?: GPayMeta
): Promise<{ ok: boolean; message?: string }> {
  const ref = meta?.reference ?? `gpay_credit_${userId}_${Date.now()}`;
  const desc = meta?.description ?? "GPay Coins credit";
  const r = await creditCoins(userId, 0, Math.floor(amount), desc, ref, "celo_payout");
  if (!r.success) return { ok: false, message: r.message };
  return { ok: true };
}
