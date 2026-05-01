/**
 * Coin Flip PvP: idempotent platform fee via coin_flip_record_platform_fee RPC
 * (platform_earnings + platform_balance).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordCoinFlipPvpPlatformFee(
  supabase: SupabaseClient,
  gameId: string,
  platformFeeGpc: number,
  winnerUserId: string,
  idempotencyKey: string
): Promise<{ ok: boolean; message?: string }> {
  const fee = Math.floor(platformFeeGpc);
  if (!Number.isFinite(fee) || fee <= 0) return { ok: true };

  const { data, error } = await supabase.rpc("coin_flip_record_platform_fee", {
    p_game_id: gameId,
    p_amount_gpc: fee,
    p_winner_user_id: winnerUserId,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    console.error("[coin-flip] coin_flip_record_platform_fee RPC failed:", error.message);
    return { ok: false, message: error.message };
  }

  const row = data as { inserted?: boolean; reason?: string } | null;
  if (row && row.inserted === false && row.reason === "duplicate_or_conflict") {
    return { ok: true };
  }
  return { ok: true };
}
