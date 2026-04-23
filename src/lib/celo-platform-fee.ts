import type { SupabaseClient } from "@supabase/supabase-js";
import { celoAccountingAuditLog } from "@/lib/celo-accounting";

export async function insertCeloPlatformFee(
  supabase: SupabaseClient,
  amountSc: number,
  label: string,
  opts?: { userId?: string; roundId?: string; idempotencyKey?: string }
): Promise<void> {
  if (!Number.isFinite(amountSc) || amountSc <= 0) return;
  const row: Record<string, unknown> = {
    source: "celo_game",
    amount_cents: Math.max(0, Math.floor(amountSc)),
    description: label,
  };
  if (opts?.userId) row.user_id = opts.userId;
  if (opts?.roundId) row.source_id = opts.roundId;
  if (opts?.idempotencyKey) row.idempotency_key = opts.idempotencyKey;
  const { error } = await supabase.from("platform_earnings").insert(row);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      celoAccountingAuditLog("platform_earnings_insert_duplicate_ignored", {
        idempotencyKey: opts?.idempotencyKey,
        roundId: opts?.roundId,
        label,
      });
      return;
    }
    console.error("[celo] platform_earnings insert failed:", error.message);
  }
}
