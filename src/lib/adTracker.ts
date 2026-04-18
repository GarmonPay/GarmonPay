/**
 * Shared ad timing constants + referral upgrade commissions.
 */
import { createAdminClient } from "@/lib/supabase";
import { creditCoins } from "@/lib/coins";

export const MIN_VIDEO_WATCH_SECONDS_DEFAULT = 5;
export const MIN_BANNER_DWELL_MS = 800;

export type MembershipPlan = "free" | "starter" | "growth" | "pro" | "elite";
export type UpgradePlan = "starter" | "growth" | "pro" | "elite";

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

/** GPC commission from Stripe line total (cents) × referrer tier rate. 100 GPC = $1. */
export function referralUpgradeCommissionGpc(referrerPlan: MembershipPlan, upgradePriceCents: number): number {
  const cents = Math.max(0, Math.floor(Number(upgradePriceCents) || 0));
  const rate = REFERRAL_COMMISSION_RATE_BY_REFERRER_PLAN[referrerPlan] ?? 0.1;
  return Math.floor(cents * rate);
}

async function isSafeToCredit(referrerId: string, amountGpc: number): Promise<boolean> {
  if (!Number.isFinite(amountGpc) || amountGpc <= 0 || amountGpc > 2_000_000) return false;
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
  /** Stripe checkout amount_total (USD cents) for this upgrade payment. */
  upgradePriceCents: number;
  stripeSessionId?: string | null;
  stripeSubscriptionId?: string | null;
}): Promise<{ granted: boolean; amountGpc?: number; referrerId?: string; reason?: string }> {
  const supabase = createAdminClient();
  if (!supabase) return { granted: false, reason: "supabase_unavailable" };

  const { data: upgraded } = await supabase
    .from("users")
    .select("id, referred_by, full_name, email")
    .eq("id", params.upgradedUserId)
    .maybeSingle();
  const upgradedRow = upgraded as { referred_by?: string | null; full_name?: string | null; email?: string | null } | null;
  const referredBy = upgradedRow?.referred_by ?? null;
  if (!referredBy) return { granted: false, reason: "no_referrer" };
  if (referredBy === params.upgradedUserId) return { granted: false, reason: "self_referral" };

  const upgradedName =
    (typeof upgradedRow?.full_name === "string" && upgradedRow.full_name.trim()
      ? upgradedRow.full_name.trim()
      : null) ??
    (typeof upgradedRow?.email === "string" ? upgradedRow.email.split("@")[0] : null) ??
    "Member";

  const { data: referrer } = await supabase
    .from("users")
    .select("id, membership, membership_tier")
    .eq("id", referredBy)
    .maybeSingle();
  if (!(referrer as { id?: string } | null)?.id) return { granted: false, reason: "referrer_missing" };

  const refRow = referrer as { membership?: string | null; membership_tier?: string | null };
  const referrerPlan = normalizeMembershipPlan(refRow.membership_tier ?? refRow.membership);
  const amountGpc = referralUpgradeCommissionGpc(referrerPlan, params.upgradePriceCents);

  if (amountGpc <= 0) return { granted: false, reason: "zero_commission" };

  if (!(await isSafeToCredit(referredBy, amountGpc))) {
    return { granted: false, reason: "unsafe_credit" };
  }

  const planLabel = params.upgradePlan.charAt(0).toUpperCase() + params.upgradePlan.slice(1);
  const description = `Commission from ${upgradedName} upgrading to ${planLabel}`;
  const ref = `referral_upgrade_${params.upgradedUserId}`;
  const credit = await creditCoins(referredBy, 0, amountGpc, description, ref, "referral_commission");
  if (!credit.success) {
    if ((credit.message ?? "").toLowerCase().includes("duplicate")) {
      return { granted: true, amountGpc, referrerId: referredBy };
    }
    return { granted: false, reason: credit.message ?? "credit_failed" };
  }

  await supabase.from("transactions").insert({
    user_id: referredBy,
    type: "referral_commission",
    amount: amountGpc,
    status: "completed",
    description,
    reference_id: ref,
    ...(params.stripeSessionId && { stripe_session: params.stripeSessionId }),
  });

  return { granted: true, amountGpc, referrerId: referredBy };
}
