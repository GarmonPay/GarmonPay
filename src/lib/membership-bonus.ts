import type { SupabaseClient } from "@supabase/supabase-js";
import { creditCoins } from "@/lib/coins";
import { createGarmonNotification } from "@/lib/garmon-notifications";

/** One-time GPC when moving between tiers (difference for paid→paid). */
export const UPGRADE_BONUSES: Record<string, number> = {
  free_to_starter: 500,
  free_to_growth: 1500,
  free_to_pro: 3500,
  free_to_elite: 8000,
  starter_to_growth: 1000,
  starter_to_pro: 3000,
  starter_to_elite: 7500,
  growth_to_pro: 2000,
  growth_to_elite: 6500,
  pro_to_elite: 4500,
};

/** Recurring monthly GPC while subscribed. */
export const MONTHLY_BONUSES: Record<string, number> = {
  starter: 100,
  growth: 300,
  pro: 600,
  elite: 1500,
};

/** First month total (upgrade + first monthly) for marketing copy. */
export const FIRST_MONTH_TOTAL_GPC: Record<string, number> = {
  starter: 600,
  growth: 1800,
  pro: 4100,
  elite: 9500,
};

const PAID = new Set(["starter", "growth", "pro", "elite"]);

export function normalizeMembershipTierKey(raw: string | null | undefined): string {
  const t = (raw ?? "free").toLowerCase().trim();
  if (!t || t === "none") return "free";
  if (t === "vip") return "elite";
  if (PAID.has(t)) return t;
  return "free";
}

function upgradeKey(fromTier: string, toTier: string): string {
  return `${normalizeMembershipTierKey(fromTier)}_to_${normalizeMembershipTierKey(toTier)}`;
}

async function insertTransactionsRow(
  supabase: SupabaseClient,
  userId: string,
  type: "membership_upgrade_bonus" | "monthly_membership_bonus",
  amountGpc: number,
  description: string,
  referenceId: string
): Promise<void> {
  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    type,
    amount: amountGpc,
    status: "completed",
    description,
    reference_id: referenceId,
  });
  if (error) console.warn("[membership-bonus] transactions insert:", error.message);
}

/**
 * One-time upgrade GPC. Idempotent per (user, from→to) path via membership_bonuses + coin reference.
 */
export async function creditUpgradeBonus(
  supabase: SupabaseClient,
  userId: string,
  fromTier: string,
  toTier: string,
  idempotencySuffix: string
): Promise<{ success: boolean; gpcCredited?: number; reason?: string }> {
  const fromN = normalizeMembershipTierKey(fromTier);
  const toN = normalizeMembershipTierKey(toTier);
  if (!PAID.has(toN)) return { success: false, reason: "not_paid_tier" };

  const key = upgradeKey(fromN, toN);
  const bonusAmount = UPGRADE_BONUSES[key];
  if (!bonusAmount || bonusAmount <= 0) return { success: false, reason: "no_bonus_for_path" };

  const { data: existing } = await supabase
    .from("membership_bonuses")
    .select("id")
    .eq("user_id", userId)
    .eq("bonus_type", "upgrade_bonus")
    .eq("from_tier", fromN)
    .eq("to_tier", toN)
    .maybeSingle();

  if (existing) return { success: false, reason: "already_credited" };

  const ref = `membership_upgrade_bonus_${userId}_${key}_${idempotencySuffix}`;
  const label = toN.charAt(0).toUpperCase() + toN.slice(1);
  const cr = await creditCoins(
    userId,
    0,
    bonusAmount,
    `${label} membership upgrade bonus — ${bonusAmount} GPay Coins (GPC)`,
    ref,
    "upgrade_bonus"
  );

  if (!cr.success) {
    if ((cr.message ?? "").toLowerCase().includes("duplicate")) {
      return { success: false, reason: "duplicate_reference" };
    }
    console.error("[creditUpgradeBonus] creditCoins", cr.message);
    return { success: false, reason: cr.message ?? "credit_failed" };
  }

  await supabase.from("membership_bonuses").insert({
    user_id: userId,
    bonus_type: "upgrade_bonus",
    from_tier: fromN,
    to_tier: toN,
    gpc_amount: bonusAmount,
  });

  await insertTransactionsRow(
    supabase,
    userId,
    "membership_upgrade_bonus",
    bonusAmount,
    `${bonusAmount} GPC upgrade bonus for ${toN} membership`,
    ref
  );

  await supabase.from("users").update({ membership_bonus_claimed: true }).eq("id", userId);

  const title = `Welcome to ${label}!`;
  const body = `${bonusAmount.toLocaleString()} GPay Coins (GPC) have been added to your account. Start playing now! Open Games → /dashboard/games`;
  await createGarmonNotification(userId, "membership_gpc_upgrade", title, body).catch(() => {});

  return { success: true, gpcCredited: bonusAmount };
}

/**
 * Monthly recurring GPC. Uses last_monthly_bonus_at + 28-day guard.
 */
export async function creditMonthlyBonus(
  supabase: SupabaseClient,
  userId: string,
  tier: string,
  idempotencySuffix: string
): Promise<{ success: boolean; gpcCredited?: number; reason?: string }> {
  const t = normalizeMembershipTierKey(tier);
  if (!PAID.has(t)) return { success: false, reason: "not_paid_tier" };

  const bonusAmount = MONTHLY_BONUSES[t];
  if (!bonusAmount || bonusAmount <= 0) return { success: false, reason: "no_monthly_for_tier" };

  const ref = `membership_monthly_bonus_${userId}_${t}_${idempotencySuffix}`;
  const label = t.charAt(0).toUpperCase() + t.slice(1);
  const cr = await creditCoins(
    userId,
    0,
    bonusAmount,
    `${label} monthly GPay Coins (GPC) bonus`,
    ref,
    "monthly_membership_bonus"
  );

  if (!cr.success) {
    if ((cr.message ?? "").toLowerCase().includes("duplicate")) {
      return { success: false, reason: "duplicate_reference" };
    }
    console.error("[creditMonthlyBonus] creditCoins", cr.message);
    return { success: false, reason: cr.message ?? "credit_failed" };
  }

  const nowIso = new Date().toISOString();
  await supabase.from("users").update({ last_monthly_bonus_at: nowIso }).eq("id", userId);

  await supabase.from("membership_bonuses").insert({
    user_id: userId,
    bonus_type: "monthly_bonus",
    from_tier: null,
    to_tier: t,
    gpc_amount: bonusAmount,
  });

  await insertTransactionsRow(
    supabase,
    userId,
    "monthly_membership_bonus",
    bonusAmount,
    `${bonusAmount} GPC monthly bonus for ${t} membership`,
    ref
  );

  const title = "Monthly bonus!";
  const body = `Your ${bonusAmount.toLocaleString()} GPay Coins (GPC) monthly bonus has been added. Go play! /dashboard/games`;
  await createGarmonNotification(userId, "membership_gpc_monthly", title, body).catch(() => {});

  return { success: true, gpcCredited: bonusAmount };
}

/** After Stripe checkout or balance upgrade: upgrade path bonus + first monthly. */
export async function applyMembershipUpgradeAndFirstMonthly(
  supabase: SupabaseClient,
  userId: string,
  previousTier: string,
  newTier: string,
  idempotencySuffix: string
): Promise<{ upgradeGpc: number; monthlyGpc: number }> {
  const up = await creditUpgradeBonus(supabase, userId, previousTier, newTier, idempotencySuffix);
  const mo = await creditMonthlyBonus(supabase, userId, newTier, `first_${idempotencySuffix}`);
  return {
    upgradeGpc: up.success ? up.gpcCredited ?? 0 : 0,
    monthlyGpc: mo.success ? mo.gpcCredited ?? 0 : 0,
  };
}
