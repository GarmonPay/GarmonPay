/**
 * Shared constants for ad engagement timing. Fraud checks run server-side
 * in `/api/ads/engage` (IP, velocity, bot timing, VPN heuristics).
 */
import { createAdminClient } from "@/lib/supabase";
import {
  DAILY_PAYOUT_CAPS,
  MEMBER_EARN_RATES,
  PROFIT_SAFETY_THRESHOLD,
  REFERRAL_COMMISSIONS,
  isSafeToCredit,
  type MemberPlan,
  type UpgradePlan,
} from "@/lib/profitConfig";

export const MIN_VIDEO_WATCH_SECONDS_DEFAULT = 5;

/** Minimum seconds before a banner engagement may be submitted (client hint). */
export const MIN_BANNER_DWELL_MS = 800;

type UpgradeTier = "free" | "starter" | "growth" | "pro" | "elite";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

function normalizeUpgradeTier(tier: string | null | undefined): UpgradeTier {
  const t = String(tier ?? "").trim().toLowerCase();
  if (t === "free") return "free";
  if (t === "starter" || t === "active") return "starter";
  if (t === "growth") return "growth";
  if (t === "pro") return "pro";
  if (t === "elite" || t === "vip") return "elite";
  return "free";
}

function normalizeMemberPlan(plan: string | null | undefined): MemberPlan {
  const p = String(plan ?? "").trim().toLowerCase();
  if (p === "free") return "free";
  if (p === "starter" || p === "active") return "starter";
  if (p === "growth") return "growth";
  if (p === "pro") return "pro";
  if (p === "elite" || p === "vip") return "elite";
  return "free";
}

function startOfUtcDayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString();
}

function getServerLocalStorage(): Map<string, string> {
  const g = globalThis as typeof globalThis & { __garmonServerLocalStorage?: Map<string, string> };
  if (!g.__garmonServerLocalStorage) g.__garmonServerLocalStorage = new Map<string, string>();
  return g.__garmonServerLocalStorage;
}

async function getEarnRateMultiplier(): Promise<number> {
  const { data: settingsRow } = await supabase()
    .from("platform_settings")
    .select("earn_rate_multiplier")
    .eq("id", 1)
    .maybeSingle();
  const multiplier = Number((settingsRow as { earn_rate_multiplier?: number } | null)?.earn_rate_multiplier ?? 1);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 1;
  return multiplier;
}

export async function getCurrentDailyPayoutTotalCents(): Promise<number> {
  const startIso = startOfUtcDayIso();
  const { data } = await supabase()
    .from("transactions")
    .select("amount, type, status")
    .eq("status", "completed")
    .gte("created_at", startIso)
    .in("type", ["earning", "ad_view", "task_complete", "game_reward", "referral_upgrade"]);
  return (data ?? []).reduce((sum, r) => sum + Number((r as { amount: number }).amount ?? 0), 0);
}

async function getUserPlan(userId: string): Promise<MemberPlan> {
  const { data: row } = await supabase()
    .from("users")
    .select("membership")
    .eq("id", userId)
    .maybeSingle();
  return normalizeMemberPlan((row as { membership?: string } | null)?.membership ?? null);
}

export async function completeAdView(params: {
  userId: string;
  referenceId: string;
  baseAmountCents?: number;
}): Promise<
  | { success: true; amountCents: number; plan: MemberPlan }
  | { success: false; reason: "payout_cap_reached" | "invalid_user" }
> {
  if (!params.userId) return { success: false, reason: "invalid_user" };
  await checkPlatformHealth().catch(() => {});
  const plan = await getUserPlan(params.userId);
  const earnRateMultiplier = await getEarnRateMultiplier();
  const configuredCents = Math.max(
    1,
    Math.round(MEMBER_EARN_RATES[plan].adViewUsd * 100 * earnRateMultiplier)
  );
  const rewardCents = params.baseAmountCents && params.baseAmountCents > 0
    ? Math.min(Math.round(params.baseAmountCents), configuredCents)
    : configuredCents;
  const currentDaily = await getCurrentDailyPayoutTotalCents();
  if (!isSafeToCredit(rewardCents, currentDaily)) {
    await supabase().from("transactions").insert({
      user_id: params.userId,
      type: "ad_view",
      amount: rewardCents,
      status: "deferred",
      description: "Ad view payout deferred due to daily cap",
      reference_id: params.referenceId,
    });
    return { success: false, reason: "payout_cap_reached" };
  }
  return { success: true, amountCents: rewardCents, plan };
}

export async function checkPlatformHealth(): Promise<{
  ok: boolean;
  margin: number;
  multiplier: number;
}> {
  const serverLocalStorage = getServerLocalStorage();
  const nowMs = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  const lastCheckMs = Number(serverLocalStorage.get("profit_health_last_check_ms") ?? 0);

  const { data: currentSettings } = await supabase()
    .from("platform_settings")
    .select("earn_rate_multiplier")
    .eq("id", 1)
    .maybeSingle();
  const currentMultiplier = Number(
    (currentSettings as { earn_rate_multiplier?: number } | null)?.earn_rate_multiplier ?? 1
  );

  if (lastCheckMs && nowMs - lastCheckMs < oneHourMs) {
    return { ok: true, margin: (1 - PROFIT_SAFETY_THRESHOLD) * 100, multiplier: currentMultiplier };
  }

  let margin = 0;
  try {
    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/api/admin/profit-monitor`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PROFIT_MONITOR_INTERNAL_KEY
          ? { "x-internal-health-key": process.env.PROFIT_MONITOR_INTERNAL_KEY }
          : {}),
      },
      cache: "no-store",
    });
    if (res.ok) {
      const payload = (await res.json()) as { profit_margin_today?: number };
      margin = Number(payload.profit_margin_today ?? 0);
    } else {
      throw new Error("profit-monitor unavailable");
    }
  } catch {
    // Fallback to direct DB metrics if the monitor endpoint is not reachable.
    const startIso = startOfUtcDayIso();
    const [revRes, payoutRes] = await Promise.all([
      supabase()
        .from("transactions")
        .select("amount")
        .eq("status", "completed")
        .gte("created_at", startIso)
        .in("type", ["deposit", "advertiser_payment"]),
      supabase()
        .from("transactions")
        .select("amount")
        .eq("status", "completed")
        .gte("created_at", startIso)
        .in("type", ["earning", "ad_view", "task_complete", "game_reward", "referral_upgrade"]),
    ]);
    const revenue = (revRes.data ?? []).reduce(
      (sum, r) => sum + Number((r as { amount: number }).amount ?? 0),
      0
    );
    const payouts = (payoutRes.data ?? []).reduce(
      (sum, r) => sum + Number((r as { amount: number }).amount ?? 0),
      0
    );
    margin = revenue > 0 ? ((revenue - payouts) / revenue) * 100 : 100;
  }
  let nextMultiplier = currentMultiplier;
  if (margin < 60) nextMultiplier = 0.8;
  else if (margin > 70) nextMultiplier = 1.0;

  await supabase()
    .from("platform_settings")
    .upsert(
      {
        id: 1,
        earn_rate_multiplier: nextMultiplier,
        daily_payout_cap_cents: DAILY_PAYOUT_CAPS.totalMemberPayoutCents,
        last_health_check: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  serverLocalStorage.set("profit_health_last_check_ms", String(nowMs));
  return { ok: true, margin, multiplier: nextMultiplier };
}

async function resolveReferrerUserId(
  referredUserId: string
): Promise<{ referrerId: string | null; referredByCode: string | null }> {
  const { data: referred } = await supabase()
    .from("users")
    .select("id, referred_by_code")
    .eq("id", referredUserId)
    .maybeSingle();
  const referredByCode = (referred as { referred_by_code?: string } | null)?.referred_by_code ?? null;
  if (!referredByCode) return { referrerId: null, referredByCode: null };

  const { data: referrer } = await supabase()
    .from("users")
    .select("id")
    .eq("referral_code", referredByCode)
    .maybeSingle();
  const referrerId = (referrer as { id?: string } | null)?.id ?? null;
  if (!referrerId || referrerId === referredUserId) return { referrerId: null, referredByCode };
  return { referrerId, referredByCode };
}

async function incrementUserBalance(userId: string, amountCents: number): Promise<void> {
  const { data } = await supabase().rpc("increment_user_balance", {
    uid: userId,
    amount: amountCents,
  });
  if (data != null) return;

  const { data: row } = await supabase().from("users").select("balance").eq("id", userId).single();
  const current = Number((row as { balance?: number } | null)?.balance ?? 0);
  await supabase()
    .from("users")
    .update({ balance: current + amountCents, updated_at: new Date().toISOString() })
    .eq("id", userId);
}

async function insertReferralUpgradeTransaction(params: {
  userId: string;
  amountCents: number;
  description: string;
  referenceId: string;
}): Promise<void> {
  const primary = await supabase().from("transactions").insert({
    user_id: params.userId,
    type: "referral_upgrade",
    amount: params.amountCents,
    status: "completed",
    description: params.description,
    reference_id: params.referenceId,
  });
  if (!primary.error) return;

  // Safety fallback for environments that have not yet migrated transaction type checks.
  await supabase().from("transactions").insert({
    user_id: params.userId,
    type: "referral",
    amount: params.amountCents,
    status: "completed",
    description: `[referral_upgrade] ${params.description}`,
    reference_id: params.referenceId,
  });
}

export async function creditReferralJoin(
  referredUserId: string,
  bonusCents = 50
): Promise<{ granted: boolean; referrerId?: string; reason?: string; amountCents?: number }> {
  try {
    if (!referredUserId) return { granted: false, reason: "invalid_user" };
    if (!Number.isFinite(bonusCents) || bonusCents <= 0) return { granted: false, reason: "invalid_bonus" };

    const { referrerId } = await resolveReferrerUserId(referredUserId);
    if (!referrerId) return { granted: false, reason: "no_referrer" };

    const { data: existing } = await supabase()
      .from("referral_bonus")
      .select("id")
      .eq("referred_user_id", referredUserId)
      .maybeSingle();
    if (existing) return { granted: false, referrerId, reason: "already_credited" };

    const { data: inserted, error: insertErr } = await supabase()
      .from("referral_bonus")
      .insert({
        referrer_id: referrerId,
        referred_user_id: referredUserId,
        amount: bonusCents,
        status: "paid",
      })
      .select("id")
      .single();
    if (insertErr) {
      if (insertErr.code === "23505") return { granted: false, referrerId, reason: "already_credited" };
      return { granted: false, referrerId, reason: insertErr.message };
    }

    await incrementUserBalance(referrerId, bonusCents);
    await supabase().from("transactions").insert({
      user_id: referrerId,
      type: "referral",
      amount: bonusCents,
      status: "completed",
      description: "Referral join bonus",
      reference_id: (inserted as { id?: string } | null)?.id ?? null,
    });

    return { granted: true, referrerId, amountCents: bonusCents };
  } catch (e) {
    return { granted: false, reason: e instanceof Error ? e.message : "credit_referral_join_failed" };
  }
}

export async function creditReferralUpgrade(params: {
  referredUserId: string;
  upgradedToTier: string;
  previousTier?: string | null;
  referenceId?: string | null;
}): Promise<{ granted: boolean; referrerId?: string; amountCents?: number; reason?: string }> {
  try {
    if (!params.referredUserId) return { granted: false, reason: "invalid_user" };

    const upgradedToTier = normalizeUpgradeTier(params.upgradedToTier);
    const previousTier = normalizeUpgradeTier(params.previousTier);
    if (upgradedToTier === "free") return { granted: false, reason: "not_paid_upgrade" };

    const { referrerId } = await resolveReferrerUserId(params.referredUserId);
    if (!referrerId) return { granted: false, reason: "no_referrer" };

    const { data: referrerUser } = await supabase()
      .from("users")
      .select("membership")
      .eq("id", referrerId)
      .maybeSingle();
    const referrerPlan = normalizeMemberPlan(
      (referrerUser as { membership?: string } | null)?.membership ?? null
    );

    const targetTier = upgradedToTier as UpgradePlan;
    const previousTierForDiff = previousTier === "free" ? "free" : (previousTier as UpgradePlan);
    const toUsd = REFERRAL_COMMISSIONS[referrerPlan][targetTier];
    const fromUsd =
      previousTierForDiff === "free"
        ? 0
        : REFERRAL_COMMISSIONS[referrerPlan][previousTierForDiff];
    const toCents = Math.round(toUsd * 100);
    const fromCents = Math.round(fromUsd * 100);
    const amountCents = Math.max(0, toCents - fromCents);
    if (amountCents <= 0) return { granted: false, reason: "no_incremental_commission" };

    const referenceId =
      params.referenceId?.trim() ||
      `referral_upgrade:${params.referredUserId}:${previousTier}->${upgradedToTier}`;
    const { data: existing } = await supabase()
      .from("transactions")
      .select("id")
      .eq("user_id", referrerId)
      .eq("reference_id", referenceId)
      .maybeSingle();
    if (existing) return { granted: false, referrerId, reason: "already_credited" };

    const currentDaily = await getCurrentDailyPayoutTotalCents();
    if (!isSafeToCredit(amountCents, currentDaily)) {
      await supabase().from("transactions").insert({
        user_id: referrerId,
        type: "referral_upgrade",
        amount: amountCents,
        status: "deferred",
        description: `Referral upgrade deferred ${previousTier} -> ${upgradedToTier}`,
        reference_id: referenceId,
      });
      return { granted: false, referrerId, amountCents, reason: "payout_cap_reached" };
    }

    await incrementUserBalance(referrerId, amountCents);

    await insertReferralUpgradeTransaction({
      userId: referrerId,
      amountCents,
      description: `Referral member upgraded ${previousTier} -> ${upgradedToTier}`,
      referenceId,
    });

    // Keep existing leaderboard/rewards flows compatible.
    await supabase().from("referral_rewards").insert({
      user_id: referrerId,
      reward_type: "subscription_commission",
      amount: amountCents / 100,
      referral_id: null,
    });

    await supabase()
      .from("viral_referrals")
      .update({ status: "subscribed" })
      .eq("referred_user_id", params.referredUserId);

    return { granted: true, referrerId, amountCents };
  } catch (e) {
    return { granted: false, reason: e instanceof Error ? e.message : "credit_referral_upgrade_failed" };
  }
}
