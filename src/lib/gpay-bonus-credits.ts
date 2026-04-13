import { createAdminClient } from "@/lib/supabase";
import { creditCoins } from "@/lib/coins";

/** New member welcome credit (GPC in `users.sweeps_coins`). */
export const SIGNUP_BONUS_GPC = 100;

/** One-time style bonus when upgrading to a paid tier (not on renewal). */
export const MEMBERSHIP_UPGRADE_BONUS_GPC: Record<string, number> = {
  starter: 200,
  growth: 750,
  pro: 2000,
  elite: 5000,
};

export function getUpgradeBonusGpc(tier: string): number {
  return MEMBERSHIP_UPGRADE_BONUS_GPC[tier.toLowerCase()] ?? 0;
}

/** Idempotent: skips if `signup_bonus_<userId>` already exists in `coin_transactions`. */
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

/**
 * Credits GPC after a successful paid-tier upgrade (Stripe or balance).
 * `uniqueSuffix` must be unique per event (e.g. session id or timestamp).
 */
export async function grantMembershipUpgradeBonusGpc(
  userId: string,
  tier: string,
  uniqueSuffix: string
): Promise<{ ok: boolean; granted: boolean; amount: number }> {
  const amount = getUpgradeBonusGpc(tier);
  if (amount <= 0) return { ok: true, granted: false, amount: 0 };
  const t = tier.toLowerCase();
  const ref = `upgrade_bonus_${userId}_${t}_${uniqueSuffix}`;
  const label = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  const r = await creditCoins(
    userId,
    0,
    amount,
    `${label} upgrade bonus - ${amount} GPay Coins`,
    ref,
    "upgrade_bonus"
  );
  if (!r.success) {
    if ((r.message ?? "").toLowerCase().includes("duplicate")) return { ok: true, granted: false, amount };
    console.error("[grantMembershipUpgradeBonusGpc]", r.message);
    return { ok: false, granted: false, amount };
  }
  return { ok: true, granted: true, amount };
}
