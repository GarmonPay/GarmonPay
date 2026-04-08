/**
 * Single source of truth for USD wallet: `wallet_ledger` (append-only, successful entries only).
 * Does not include GPay. Excludes legacy `profiles.balance` / `users.balance` as authoritative.
 */

import { createAdminClient } from "@/lib/supabase";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export interface UsdWalletLedgerSummary {
  /** Latest running balance from ledger (same as displayed available USD). */
  availableBalanceCents: number;
  totalDepositsCents: number;
  totalWithdrawnCents: number;
  /** Credits: game_win, referral_bonus, commission_payout, ad_earning */
  totalEarningsCents: number;
  totalAdminCreditsCents: number;
  totalAdminDebitsCents: number;
  /** Magnitude of subscription / membership debits (amounts typically negative in ledger). */
  totalSubscriptionPaymentCents: number;
  /** Magnitude of game_play debits */
  totalGamePlayCents: number;
  /** Legacy ad-credit conversions recorded only on `transactions`, not wallet_ledger (see RPC). */
  totalUsdToAdCreditFromTransactionsCents: number;
  /** For diagnostics: stored aggregate row vs ledger-derived available */
  walletBalancesRowCents: number | null;
}

const EARNING_TYPES = new Set(["game_win", "referral_bonus", "commission_payout", "ad_earning"]);

/**
 * USD available balance = `balance_after` of the latest `wallet_ledger` row for the user (cents).
 * If there are no ledger rows, returns 0.
 */
export async function getUsdWalletBalanceCents(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from("wallet_ledger")
    .select("balance_after")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return 0;
  const n = Number((data as { balance_after?: number }).balance_after);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/**
 * Full ledger-derived summary + optional legacy ad_credit total from `transactions`.
 * Use this for dashboard + transaction history summary so totals match Available Balance.
 */
export async function getUsdWalletLedgerSummary(userId: string): Promise<UsdWalletLedgerSummary> {
  const client = supabase();
  const { data: rows, error } = await client
    .from("wallet_ledger")
    .select("type, amount")
    .eq("user_id", userId);
  if (error) {
    console.error("[usd-wallet-balance] ledger select:", error.message);
  }
  const list = (rows ?? []) as { type: string; amount: number }[];

  let totalDepositsCents = 0;
  let totalWithdrawnCents = 0;
  let totalEarningsCents = 0;
  let totalAdminCreditsCents = 0;
  let totalAdminDebitsCents = 0;
  let totalSubscriptionPaymentCents = 0;
  let totalGamePlayCents = 0;

  for (const r of list) {
    const amt = Number(r.amount);
    if (!Number.isFinite(amt)) continue;
    const t = r.type;
    if (t === "deposit" && amt > 0) {
      totalDepositsCents += amt;
    } else if (t === "withdrawal" && amt < 0) {
      totalWithdrawnCents += -amt;
    } else if (EARNING_TYPES.has(t) && amt > 0) {
      totalEarningsCents += amt;
    } else if (t === "admin_adjustment") {
      if (amt > 0) totalAdminCreditsCents += amt;
      else totalAdminDebitsCents += -amt;
    } else if (t === "subscription_payment" && amt < 0) {
      totalSubscriptionPaymentCents += -amt;
    } else if (t === "game_play" && amt < 0) {
      totalGamePlayCents += -amt;
    }
  }

  const availableBalanceCents = await getUsdWalletBalanceCents(userId);

  const { data: wbRow } = await client.from("wallet_balances").select("balance").eq("user_id", userId).maybeSingle();
  const walletBalancesRowCents =
    wbRow != null ? Math.round(Number((wbRow as { balance?: number }).balance ?? 0)) : null;

  let totalUsdToAdCreditFromTransactionsCents = 0;
  const { data: adRows, error: adErr } = await client
    .from("transactions")
    .select("amount, status")
    .eq("user_id", userId)
    .eq("type", "ad_credit");
  if (!adErr && adRows) {
    for (const r of adRows as { amount: number; status: string }[]) {
      if (r.status === "completed") totalUsdToAdCreditFromTransactionsCents += Math.max(0, Number(r.amount) || 0);
    }
  }

  return {
    availableBalanceCents,
    totalDepositsCents,
    totalWithdrawnCents,
    totalEarningsCents,
    totalAdminCreditsCents,
    totalAdminDebitsCents,
    totalSubscriptionPaymentCents,
    totalGamePlayCents,
    totalUsdToAdCreditFromTransactionsCents,
    walletBalancesRowCents,
  };
}

/** Alias (per product naming). */
export { getUsdWalletBalanceCents as getUsdWalletBalance };
