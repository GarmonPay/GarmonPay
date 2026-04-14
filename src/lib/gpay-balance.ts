import { createAdminClient } from "@/lib/supabase";
import { creditCoins, debitSweepsCoins } from "@/lib/coins";

export async function getGPayBalance(userId: string): Promise<number> {
  const supabase = createAdminClient();
  if (!supabase) return 0;
  const { data } = await supabase
    .from("users")
    .select("sweeps_coins")
    .eq("id", userId)
    .maybeSingle();
  return Number(
    (data as { sweeps_coins?: number } | null)?.sweeps_coins ?? 0
  );
}

type GPayMeta = { description?: string; reference?: string };

/**
 * Debit `users.sweeps_coins` via `debit_sweeps_coins` RPC + ledger (atomic).
 * `currentBalance` is accepted for API compatibility; balance is always re-read server-side.
 */
export async function deductGPay(
  userId: string,
  amount: number,
  currentBalance?: number,
  meta?: GPayMeta
): Promise<{ ok: boolean; message?: string }> {
  void currentBalance;
  const ref = meta?.reference ?? `gpay_deduct_${userId}_${Date.now()}`;
  const desc = meta?.description ?? "C-Lo $GPAY";
  const r = await debitSweepsCoins(userId, amount, desc, ref);
  if (!r.success) {
    let msg = r.message ?? "Insufficient $GPAY balance";
    msg = msg.replace(/\bGPC\b/g, "$GPAY");
    return { ok: false, message: msg };
  }
  return { ok: true };
}

export async function creditGPay(
  userId: string,
  amount: number,
  meta?: GPayMeta
): Promise<{ ok: boolean; message?: string }> {
  const ref = meta?.reference ?? `gpay_credit_${userId}_${Date.now()}`;
  const desc = meta?.description ?? "C-Lo $GPAY credit";
  const r = await creditCoins(
    userId,
    0,
    Math.floor(amount),
    desc,
    ref,
    "celo_payout"
  );
  if (!r.success) return { ok: false, message: r.message };
  return { ok: true };
}
