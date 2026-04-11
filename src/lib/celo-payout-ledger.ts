/**
 * C-Lo payout helpers: structured logging + wallet_balances verification + platform_earnings fee lines.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { celoFirstRow } from "@/lib/celo-first-row";
import {
  walletLedgerEntry,
  type LedgerEntryError,
  type LedgerEntryResult,
} from "@/lib/wallet-ledger";

export async function celoWalletCredit(
  supabase: SupabaseClient,
  userId: string,
  amountCents: number,
  reference: string,
): Promise<LedgerEntryResult | LedgerEntryError> {
  console.error("[celo/payout] crediting:", { userId, amount: amountCents, reference });
  const result = await walletLedgerEntry(userId, "game_win", amountCents, reference);
  console.error("[celo/payout] result:", result);
  if (!result.success) {
    console.error("[celo/payout] ledger error:", result.message);
  } else {
    const { data: wbRows } = await supabase
      .from("wallet_balances")
      .select("balance")
      .eq("user_id", userId)
      .limit(1);
    const updatedWallet = celoFirstRow(wbRows);
    console.error("[celo/payout] new balance:", (updatedWallet as { balance?: number } | null)?.balance);
  }
  return result;
}

export async function insertCeloPlatformFee(
  supabase: SupabaseClient,
  roundId: string,
  platformFeeCents: number,
  rollName: string,
  opts?: { userId?: string | null; description?: string },
): Promise<void> {
  if (!Number.isFinite(platformFeeCents) || platformFeeCents <= 0) return;
  const row: Record<string, unknown> = {
    source: "celo_game",
    source_id: roundId,
    amount_cents: Math.round(platformFeeCents),
    description: opts?.description ?? `C-Lo platform fee - ${rollName}`,
  };
  if (opts?.userId) row.user_id = opts.userId;
  const { error } = await supabase.from("platform_earnings").insert(row);
  if (error) {
    console.error("[celo/payout] platform_earnings insert failed:", error.message);
  }
}

/** Optional 1¢ RPC smoke test (enable with CELO_PAYOUT_TEST_CREDIT=1 on server). */
export async function celoPayoutTestCredit(
  supabase: SupabaseClient,
  bankerId: string,
): Promise<void> {
  if (process.env.CELO_PAYOUT_TEST_CREDIT !== "1") return;
  const ref = `test_credit_${Date.now()}`;
  console.error("[celo/payout] running test credit (CELO_PAYOUT_TEST_CREDIT=1)…");
  const testCredit = await celoWalletCredit(supabase, bankerId, 1, ref);
  if (!testCredit.success) {
    console.error("[celo/payout] test credit failed:", testCredit.message);
  }
}
