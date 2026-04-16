import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

/** 1000 GC ≈ $1 (display) */
export const GC_TO_USD = 0.001;
/** 1 GPC = $0.01 face value; 100 GPC = $1 (DB: users.gpay_coins) */
export const GPC_TO_USD = 0.01;
/** $1 → 100 GPC */
export const USD_TO_GPC = 100;

/** @deprecated use GPC_TO_USD */
export const SC_TO_USD = GPC_TO_USD;
/** @deprecated use USD_TO_GPC */
export const USD_TO_SC = USD_TO_GPC;

export function gpcToUsdDisplay(gpc: number): string {
  const n = Number(gpc);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${(n * GPC_TO_USD).toFixed(2)}`;
}

/** @deprecated use gpcToUsdDisplay */
export function scToUsdDisplay(sc: number): string {
  return gpcToUsdDisplay(sc);
}

export async function getUserCoins(userId: string): Promise<{
  goldCoins: number;
  gpayCoins: number;
  gpayTokens: number;
}> {
  const supabase = createAdminClient();
  if (!supabase) return { goldCoins: 0, gpayCoins: 0, gpayTokens: 0 };

  const { data } = await supabase
    .from("users")
    .select("gold_coins, gpay_coins, gpay_tokens")
    .eq("id", userId)
    .maybeSingle();

  const row = data as {
    gold_coins?: number | null;
    gpay_coins?: number | null;
    gpay_tokens?: number | null;
  } | null;
  return {
    goldCoins: Math.max(0, Math.floor(Number(row?.gold_coins ?? 0))),
    gpayCoins: Math.max(0, Math.floor(Number(row?.gpay_coins ?? 0))),
    gpayTokens: Math.max(0, Math.floor(Number(row?.gpay_tokens ?? 0))),
  };
}

export async function creditCoins(
  userId: string,
  goldCoins: number,
  gpayCoins: number,
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
    p_gpay_coins: Math.floor(gpayCoins),
  });

  if (error) return { success: false, message: error.message };

  const { error: insErr } = await supabase.from("coin_transactions").insert({
    user_id: userId,
    type,
    gold_coins: Math.floor(goldCoins),
    gpay_coins: Math.floor(gpayCoins),
    description,
    reference,
  });
  if (insErr) {
    console.error("[creditCoins] ledger insert failed after RPC:", insErr.message);
  }

  return { success: true };
}

/**
 * Credit GPC idempotently: duplicate `reference` in coin_transactions counts as success.
 */
export async function creditGpayIdempotent(
  userId: string,
  amountGpc: number,
  description: string,
  reference: string,
  type = "celo_bank_refund"
): Promise<{ success: boolean; message?: string }> {
  const amt = Math.floor(amountGpc);
  if (amt <= 0) return { success: true };
  const r = await creditCoins(userId, 0, amt, description, reference, type);
  if (r.success) return { success: true };
  if (typeof r.message === "string" && r.message.toLowerCase().includes("duplicate")) {
    return { success: true };
  }
  return r;
}

/** @deprecated use creditGpayIdempotent */
export async function creditSweepsIdempotent(
  userId: string,
  amountSc: number,
  description: string,
  reference: string,
  type = "celo_bank_refund"
): Promise<{ success: boolean; message?: string }> {
  return creditGpayIdempotent(userId, amountSc, description, reference, type);
}

export async function debitGpayCoins(
  userId: string,
  amount: number,
  description: string,
  reference: string
): Promise<{ success: boolean; message?: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { success: false, message: "Service unavailable" };

  const amt = Math.floor(amount);
  if (amt <= 0) return { success: false, message: "Invalid amount" };

  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < amt) {
    return {
      success: false,
      message: `Insufficient GPay Coins. You have ${gpayCoins} GPC but need ${amt} GPC`,
    };
  }

  const { data: existing } = await supabase
    .from("coin_transactions")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();
  if (existing) return { success: false, message: "Duplicate transaction" };

  const { error } = await supabase.rpc("debit_gpay_coins", {
    p_user_id: userId,
    p_amount: amt,
  });

  if (error) {
    const msg = error.message ?? "";
    const friendly =
      /insufficient.*gpay/i.test(msg) || /gpay coins/i.test(msg)
        ? "Insufficient GPay Coins"
        : msg;
    return { success: false, message: friendly };
  }

  const { error: insErr } = await supabase.from("coin_transactions").insert({
    user_id: userId,
    type: "debit",
    gold_coins: 0,
    gpay_coins: -amt,
    description,
    reference,
  });
  if (insErr) {
    console.error("[debitGpayCoins] insert failed after RPC — repairing:", insErr.message);
    const repairRef = `${reference}_repair_${Date.now()}`;
    await creditCoins(
      userId,
      0,
      amt,
      "Repair: ledger insert failed after debit_gpay_coins RPC",
      repairRef,
      "debit_repair"
    );
  }

  return { success: true };
}

/** @deprecated use debitGpayCoins */
export async function debitSweepsCoins(
  userId: string,
  amount: number,
  description: string,
  reference: string
): Promise<{ success: boolean; message?: string }> {
  return debitGpayCoins(userId, amount, description, reference);
}

/**
 * Convert wallet USD (cents) to GPC. One-way; deducts via wallet ledger then credits GPC.
 */
export async function convertUSDToGPC(
  userId: string,
  amountCents: number
): Promise<{ success: boolean; gpcAwarded?: number; message?: string }> {
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

  const gpcToAward = Math.floor((cents * USD_TO_GPC) / 100);
  if (gpcToAward <= 0) {
    return { success: false, message: "Amount too small to convert" };
  }

  const usdRef = `usd_to_gpc_debit_${userId}_${cents}_${gpcToAward}`;
  const ledger = await walletLedgerEntry(userId, "game_play", -cents, usdRef);
  if (!ledger.success) {
    return { success: false, message: ledger.message ?? "Failed to deduct USD balance" };
  }

  const creditRef = `usd_to_gpc_credit_${userId}_${cents}_${gpcToAward}`;
  const credit = await creditCoins(
    userId,
    0,
    gpcToAward,
    `Converted $${(cents / 100).toFixed(2)} USD to ${gpcToAward} GPC`,
    creditRef,
    "usd_to_gpc"
  );

  if (!credit.success) {
    return { success: false, message: credit.message ?? "Failed to credit GPay Coins" };
  }

  return { success: true, gpcAwarded: gpcToAward };
}

/** @deprecated use convertUSDToGPC */
export async function convertUSDToSC(
  userId: string,
  amountCents: number
): Promise<{ success: boolean; scAwarded?: number; message?: string }> {
  const r = await convertUSDToGPC(userId, amountCents);
  return { success: r.success, scAwarded: r.gpcAwarded, message: r.message };
}
