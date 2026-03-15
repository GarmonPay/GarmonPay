/**
 * Arena Season Pass: active check for perks (double login coins, extra spin, 10% store discount, VIP access, exclusive title).
 */

import { createAdminClient } from "./supabase";

export async function getSeasonPassActive(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("arena_season_pass")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  const status = (data as { status?: string } | null)?.status;
  const end = (data as { current_period_end?: string } | null)?.current_period_end;
  if (status !== "active") return false;
  if (end && new Date(end) <= new Date()) return false;
  return true;
}

/** 10% store discount when season pass active. Returns multiplier e.g. 0.9 for 10% off. */
export function seasonPassStoreMultiplier(active: boolean): number {
  return active ? 0.9 : 1;
}
