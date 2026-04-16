/**
 * C-Lo payout helpers: credit `users.gpay_coins` (GPC) + platform_earnings fee lines.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { creditGPay } from "@/lib/gpay-balance";

export async function celoWalletCredit(
  _supabase: SupabaseClient,
  userId: string,
  amountCents: number,
  reference: string,
): Promise<{ success: boolean; message?: string }> {
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { success: true };
  }
  console.error("[celo/payout] crediting GPC:", { userId, amount: amountCents, reference });
  const r = await creditGPay(userId, amountCents, {
    description: "C-Lo payout",
    reference,
  });
  console.error("[celo/payout] result:", r);
  if (!r.ok) {
    console.error("[celo/payout] credit error:", r.message);
  }
  return { success: r.ok, message: r.message };
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
