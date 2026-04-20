/**
 * Coin Flip: record house edge in platform_earnings (reporting; user balances use gpay_ledger / users.gpay_coins).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function insertCoinFlipPlatformFee(
  supabase: SupabaseClient,
  gameId: string,
  houseCutMinor: number,
  opts?: { userId?: string | null }
): Promise<void> {
  if (!Number.isFinite(houseCutMinor) || houseCutMinor <= 0) return;
  const row: Record<string, unknown> = {
    source: "coin_flip_game",
    source_id: gameId,
    amount_cents: Math.round(houseCutMinor),
    description: `Coin Flip house edge (10%) — game ${gameId}`,
  };
  if (opts?.userId) row.user_id = opts.userId;
  const { error } = await supabase.from("platform_earnings").insert(row);
  if (error) {
    console.error("[coin-flip] platform_earnings insert failed:", error.message);
  }
}
