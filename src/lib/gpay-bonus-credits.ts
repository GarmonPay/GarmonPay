import { createAdminClient } from "@/lib/supabase";
import { creditCoins } from "@/lib/coins";

/** New member welcome credit (GPC in `users.gpay_coins`). */
export const SIGNUP_BONUS_GPC = 100;

export async function grantSignupBonusGpc(userId: string): Promise<{ ok: boolean; granted: boolean }> {
  const ref = `signup_bonus_${userId}`;
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, granted: false };
  const { data: existing } = await supabase.from("coin_transactions").select("id").eq("reference", ref).maybeSingle();
  if (existing) return { ok: true, granted: false };
  const r = await creditCoins(userId, 0, SIGNUP_BONUS_GPC, "Welcome bonus - 100 GPay Coins", ref, "signup_bonus");
  if (!r.success) {
    if ((r.message ?? "").toLowerCase().includes("duplicate")) return { ok: true, granted: false };
    return { ok: false, granted: false };
  }
  return { ok: true, granted: true };
}
