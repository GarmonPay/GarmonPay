/**
 * C-Lo server-side accounting helpers: idempotent credits, conditional round updates, dev logs.
 * Canonical balances: `users.gpay_coins` via coin_transactions + RPCs.
 * Canonical room bank: `celo_rooms.current_bank_sc` (legacy `current_bank_cents` may exist; app prefers *_sc).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const CELO_ACCOUNTING_DEBUG = process.env.NODE_ENV === "development";

/** Staging / extended operator logs (server env). Does not replace CELO_ACCOUNTING_DEBUG. */
export const CELO_ACCOUNTING_AUDIT_LOG =
  process.env.NODE_ENV === "development" ||
  process.env.CELO_ACCOUNTING_AUDIT_LOG === "1";

export function celoAccountingLog(
  phase: string,
  payload: Record<string, unknown>
): void {
  if (!CELO_ACCOUNTING_DEBUG) return;
  console.log(`[C-Lo accounting] ${phase}`, payload);
}

/** Idempotent skips, finalize races, refunds — for staging operators (set CELO_ACCOUNTING_AUDIT_LOG=1). */
export function celoAccountingAuditLog(
  phase: string,
  payload: Record<string, unknown>
): void {
  if (!CELO_ACCOUNTING_AUDIT_LOG) return;
  console.log(`[C-Lo accounting audit] ${phase}`, payload);
}

/** Update a round only if `status` is one of `fromStatuses`; returns updated row or null. */
export async function celoUpdateRoundIfStatus(
  admin: SupabaseClient,
  roundId: string,
  fromStatuses: string[],
  patch: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const q = admin
    .from("celo_rounds")
    .update(patch)
    .eq("id", roundId)
    .in("status", fromStatuses)
    .select("*")
    .maybeSingle();
  const { data, error } = await q;
  if (error) {
    celoAccountingLog("round_update_error", { roundId, message: error.message });
    return null;
  }
  return (data as Record<string, unknown>) ?? null;
}

const CELO_STAKE_FEE_RATE = 0.1;

/** Per-stake: F = floor(S * fee rate), N = S − F (matched net bank moves on win/loss). */
export function celoStakeNetAndPlatformFee(stakeSc: number): { net: number; fee: number } {
  const stake = Math.max(0, Math.floor(stakeSc));
  const fee = Math.floor(stake * CELO_STAKE_FEE_RATE);
  return { net: stake - fee, fee };
}

export async function celoAdjustRoomBank(
  admin: SupabaseClient,
  roomId: string,
  deltaNetSc: number
): Promise<number> {
  const { data: row } = await admin
    .from("celo_rooms")
    .select("current_bank_sc")
    .eq("id", roomId)
    .maybeSingle();
  const cur = Math.max(
    0,
    Math.floor(Number((row as { current_bank_sc?: number })?.current_bank_sc ?? 0))
  );
  const next = Math.max(0, cur + deltaNetSc);
  await admin.from("celo_rooms").update({ current_bank_sc: next }).eq("id", roomId);
  return next;
}

/** Player phase: cumulative banker P&L and platform fees as each staked roll settles. */
export async function celoApplyRoundBankerAccountingDelta(
  admin: SupabaseClient,
  roundId: string,
  deltaPnL: number,
  deltaFee: number
): Promise<void> {
  const { error: rpcErr } = await admin.rpc("celo_increment_round_banker_accounting", {
    p_round_id: roundId,
    p_delta_pnl: deltaPnL,
    p_delta_fee: deltaFee,
  });
  if (rpcErr) {
    celoAccountingLog("round_banker_accounting_rpc_error", {
      roundId,
      message: rpcErr.message,
      code: rpcErr.code,
    });
    const { data: cur } = await admin
      .from("celo_rounds")
      .select("banker_winnings_sc, platform_fee_sc")
      .eq("id", roundId)
      .maybeSingle();
    const prevPnL = Math.floor(
      Number((cur as { banker_winnings_sc?: number })?.banker_winnings_sc ?? 0)
    );
    const prevFee = Math.floor(
      Number((cur as { platform_fee_sc?: number })?.platform_fee_sc ?? 0)
    );
    const { error: upErr } = await admin
      .from("celo_rounds")
      .update({
        banker_winnings_sc: prevPnL + deltaPnL,
        platform_fee_sc: prevFee + deltaFee,
      })
      .eq("id", roundId);
    if (upErr) {
      celoAccountingLog("round_banker_accounting_fallback_error", {
        roundId,
        message: upErr.message,
      });
      throw new Error(upErr.message);
    }
  }
}
