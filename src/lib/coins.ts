import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

/** 1000 GC ≈ $1 (display) */
export const GC_TO_USD = 0.001;
/** 1 SC = $0.01 face value; 100 SC = $1 (matches C-Lo “1000 SC ($10)” style copy) */
export const SC_TO_USD = 0.01;
/** $1 → 100 SC */
export const USD_TO_SC = 100;

export function scToUsdDisplay(sc: number): string {
  const n = Number(sc);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${(n * SC_TO_USD).toFixed(2)}`;
}

export async function getUserCoins(userId: string): Promise<{
  goldCoins: number;
  sweepsCoins: number;
}> {
  const supabase = createAdminClient();
  if (!supabase) return { goldCoins: 0, sweepsCoins: 0 };

  const { data } = await supabase
    .from("users")
    .select("gold_coins, sweeps_coins")
    .eq("id", userId)
    .maybeSingle();

  const row = data as { gold_coins?: number | null; sweeps_coins?: number | null } | null;
  return {
    goldCoins: Math.max(0, Math.floor(Number(row?.gold_coins ?? 0))),
    sweepsCoins: Math.max(0, Math.floor(Number(row?.sweeps_coins ?? 0))),
  };
}

export async function creditCoins(
  userId: string,
  goldCoins: number,
  sweepsCoins: number,
  description: string,
  reference: string,
  type = "credit"
): Promise<{ success: boolean; message?: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { success: false, message: "Service unavailable" };

  const { data: existing } = await supabase
    .from("coin_transactions")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();

  if (existing) {
    return { success: false, message: "Duplicate transaction" };
  }

  const { error } = await supabase.rpc("credit_coins", {
    p_user_id: userId,
    p_gold_coins: Math.floor(goldCoins),
    p_sweeps_coins: Math.floor(sweepsCoins),
  });

  if (error) return { success: false, message: error.message };

  const { error: insErr } = await supabase.from("coin_transactions").insert({
    user_id: userId,
    type,
    gold_coins: Math.floor(goldCoins),
    sweeps_coins: Math.floor(sweepsCoins),
    description,
    reference,
  });
  if (insErr) {
    console.error("[creditCoins] ledger insert failed after RPC:", insErr.message);
  }

  return { success: true };
}

export async function debitSweepsCoins(
  userId: string,
  amount: number,
  description: string,
  reference: string
): Promise<{ success: boolean; message?: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { success: false, message: "Service unavailable" };

  const amt = Math.floor(amount);
  if (amt <= 0) return { success: false, message: "Invalid amount" };

  const { goldCoins: _g, sweepsCoins } = await getUserCoins(userId);
  if (sweepsCoins < amt) {
    return {
      success: false,
      message: `Insufficient SC. You have ${sweepsCoins} SC but need ${amt} SC`,
    };
  }

  const { data: existing } = await supabase
    .from("coin_transactions")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();
  if (existing) return { success: false, message: "Duplicate transaction" };

  const { error } = await supabase.rpc("debit_sweeps_coins", {
    p_user_id: userId,
    p_amount: amt,
  });

  if (error) return { success: false, message: error.message };

  const { error: insErr } = await supabase.from("coin_transactions").insert({
    user_id: userId,
    type: "debit",
    gold_coins: 0,
    sweeps_coins: -amt,
    description,
    reference,
  });
  if (insErr) console.error("[debitSweepsCoins] insert failed after RPC:", insErr.message);

  return { success: true };
}

/**
 * Convert wallet USD (cents) to SC. One-way; deducts via wallet ledger then credits SC.
 */
export async function convertUSDToSC(
  userId: string,
  amountCents: number
): Promise<{ success: boolean; scAwarded?: number; message?: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { success: false, message: "Service unavailable" };

  const cents = Math.floor(amountCents);
  if (cents <= 0) return { success: false, message: "Invalid amount" };

  const { data: wallet } = await supabase
    .from("wallet_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  const usdBalance = Number((wallet as { balance?: number } | null)?.balance ?? 0);
  if (usdBalance < cents) {
    return { success: false, message: "Insufficient USD balance" };
  }

  const scToAward = Math.floor((cents * USD_TO_SC) / 100);
  if (scToAward <= 0) {
    return { success: false, message: "Amount too small to convert" };
  }

  const usdRef = `usd_to_sc_debit_${userId}_${cents}_${scToAward}`;
  const ledger = await walletLedgerEntry(userId, "game_play", -cents, usdRef);
  if (!ledger.success) {
    return { success: false, message: ledger.message ?? "Failed to deduct USD balance" };
  }

  const creditRef = `usd_to_sc_credit_${userId}_${cents}_${scToAward}`;
  const credit = await creditCoins(
    userId,
    0,
    scToAward,
    `Converted $${(cents / 100).toFixed(2)} USD to ${scToAward} SC`,
    creditRef,
    "usd_to_sc"
  );

  if (!credit.success) {
    return { success: false, message: credit.message ?? "Failed to credit SC" };
  }

  return { success: true, scAwarded: scToAward };
}
