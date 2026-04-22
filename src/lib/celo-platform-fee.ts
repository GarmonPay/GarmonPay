import type { SupabaseClient } from "@supabase/supabase-js";

export async function insertCeloPlatformFee(
  supabase: SupabaseClient,
  amountSc: number,
  label: string,
  opts?: { userId?: string; roundId?: string }
): Promise<void> {
  if (!Number.isFinite(amountSc) || amountSc <= 0) return;
  const row: Record<string, unknown> = {
    source: "celo_game",
    amount_cents: Math.max(0, Math.floor(amountSc)),
    description: label,
  };
  if (opts?.userId) row.user_id = opts.userId;
  if (opts?.roundId) row.source_id = opts.roundId;
  const { error } = await supabase.from("platform_earnings").insert(row);
  if (error) {
    console.error("[celo] platform_earnings insert failed:", error.message);
  }
}
