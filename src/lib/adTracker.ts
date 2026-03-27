/**
 * Shared ad timing constants + referral upgrade commissions.
 */
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

export const MIN_VIDEO_WATCH_SECONDS_DEFAULT = 5;
export const MIN_BANNER_DWELL_MS = 800;

export type MembershipPlan = "free" | "starter" | "growth" | "pro" | "elite";
export type UpgradePlan = "starter" | "growth" | "pro" | "elite";

export const REFERRAL_JOIN_BONUS_CENTS = 50;

export const REFERRAL_UPGRADE_PRICE_CENTS: Record<UpgradePlan, number> = {
  starter: 999,
  growth: 2499,
  pro: 4999,
  elite: 9999,
};

export const REFERRAL_COMMISSION_RATE_BY_REFERRER_PLAN: Record<MembershipPlan, number> = {
  free: 0.1,
  starter: 0.2,
  growth: 0.3,
  pro: 0.4,
  elite: 0.5,
};

export function normalizeMembershipPlan(raw: string | null | undefined): MembershipPlan {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "vip") return "elite";
  if (t === "starter" || t === "growth" || t === "pro" || t === "elite" || t === "free") return t;
  return "free";
}

export function upgradeCommissionCents(referrerPlan: MembershipPlan, upgradePlan: UpgradePlan): number {
  const priceCents = REFERRAL_UPGRADE_PRICE_CENTS[upgradePlan];
  const rate = REFERRAL_COMMISSION_RATE_BY_REFERRER_PLAN[referrerPlan];
  return Math.round(priceCents * rate);
}

async function isSafeToCredit(referrerId: string, amountCents: number): Promise<boolean> {
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 50_000) return false;
  const supabase = createAdminClient();
  if (!supabase) return false;
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("id", referrerId)
    .maybeSingle();
  return !!(user as { id?: string } | null)?.id;
}

/**
 * Commission for membership upgrades only. One-time per upgraded user.
 */
export async function creditReferralUpgradeCommission(params: {
  upgradedUserId: string;
  upgradePlan: UpgradePlan;
  stripeSessionId?: string | null;
  stripeSubscriptionId?: string | null;
}): Promise<{ granted: boolean; amountCents?: number; referrerId?: string; reason?: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { granted: false, reason: "supabase_unavailable" };

  const { data: upgraded } = await supabase
    .from("users")
    .select("id, referred_by")
    .eq("id", params.upgradedUserId)
    .maybeSingle();
  const referredBy = (upgraded as { referred_by?: string | null } | null)?.referred_by ?? null;
  if (!referredBy) return { granted: false, reason: "no_referrer" };
  if (referredBy === params.upgradedUserId) return { granted: false, reason: "self_referral" };

  const { data: referrer } = await supabase
    .from("users")
    .select("id, membership")
    .eq("id", referredBy)
    .maybeSingle();
  if (!(referrer as { id?: string } | null)?.id) return { granted: false, reason: "referrer_missing" };

  const referrerPlan = normalizeMembershipPlan((referrer as { membership?: string }).membership);
  const amountCents = upgradeCommissionCents(referrerPlan, params.upgradePlan);

  if (!(await isSafeToCredit(referredBy, amountCents))) {
    return { granted: false, reason: "unsafe_credit" };
  }

  const ledger = await walletLedgerEntry(
    referredBy,
    "commission_payout",
    amountCents,
    `referral_upgrade_${params.upgradedUserId}_${params.upgradePlan}`
  );
  if (!ledger.success) return { granted: false, reason: ledger.message };

  await supabase.from("transactions").insert({
    user_id: referredBy,
    type: "referral_upgrade",
    amount: amountCents,
    status: "completed",
    description: `Referral upgrade commission (${params.upgradePlan})`,
    reference_id: `referral_upgrade_${params.upgradedUserId}`,
  });

  return { granted: true, amountCents, referrerId: referredBy };
}
