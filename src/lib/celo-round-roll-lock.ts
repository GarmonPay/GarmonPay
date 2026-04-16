import type { SupabaseClient } from "@supabase/supabase-js";
import { CELO_ROLL_ANIMATION_DURATION_MS } from "@/lib/celo-roll-sync-constants";

type Admin = SupabaseClient;

/**
 * Try to take exclusive roll processing on a round row.
 * Returns spinStartedAt when bankerSharedSpin is used (shared animation clock for all clients).
 */
export async function celoAcquireRoundRollLock(
  supabase: Admin,
  roundId: string,
  userId: string,
  opts: { bankerSharedSpin?: boolean; spinDurationMs?: number }
): Promise<{ ok: true; spinStartedAt: string } | { ok: false }> {
  const spinStartedAt = new Date().toISOString();
  const duration = opts.spinDurationMs ?? CELO_ROLL_ANIMATION_DURATION_MS;
  const patch: Record<string, unknown> = {
    roll_processing: true,
    roller_user_id: userId,
    updated_at: spinStartedAt,
  };
  if (opts.bankerSharedSpin) {
    patch.roll_animation_start_at = spinStartedAt;
    patch.roll_animation_duration_ms = duration;
  }

  const { data, error } = await supabase
    .from("celo_rounds")
    .update(patch)
    .eq("id", roundId)
    .eq("roll_processing", false)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[celo/roll-lock] acquire error", error.message);
    return { ok: false };
  }
  if (!data) return { ok: false };
  return { ok: true, spinStartedAt };
}

export async function celoReleaseRoundRollLock(supabase: Admin, roundId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("celo_rounds")
    .update({ roll_processing: false, roller_user_id: null, updated_at: now })
    .eq("id", roundId);
  if (error) console.error("[celo/roll-lock] release error", error.message);
}
