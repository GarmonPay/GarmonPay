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
