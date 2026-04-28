import type { SupabaseClient } from "@supabase/supabase-js";
import { celoAccountingAuditLog } from "@/lib/celo-accounting";

export async function insertCeloPlatformFee(
  supabase: SupabaseClient,
  amountSc: number,
  label: string,
  opts?: { userId?: string; roundId?: string; idempotencyKey?: string }
): Promise<void> {
  if (!Number.isFinite(amountSc) || amountSc <= 0) return;
  const safeAmount = Math.max(0, Math.floor(amountSc));
  const fallbackKey = opts?.roundId
    ? `celo_fee:${opts.roundId}:${label}`
    : undefined;
  const { data, error } = await supabase.rpc("celo_record_platform_fee", {
    p_round_id: opts?.roundId ?? null,
    p_fee_type: label,
    p_amount_cents: safeAmount,
    p_description: label,
    p_user_id: opts?.userId ?? null,
    p_idempotency_key: opts?.idempotencyKey ?? fallbackKey ?? null,
  });
  if (error) {
    console.error("[celo] platform fee rpc failed:", error.message);
    return;
  }
  const inserted =
    (data as { inserted?: boolean } | null | undefined)?.inserted ?? true;
  if (!inserted) {
    celoAccountingAuditLog("platform_earnings_insert_duplicate_ignored", {
      idempotencyKey: opts?.idempotencyKey ?? fallbackKey,
      roundId: opts?.roundId,
      label,
    });
  }
}
