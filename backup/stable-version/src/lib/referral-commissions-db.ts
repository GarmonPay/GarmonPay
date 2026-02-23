/**
 * Recurring referral commissions: subscriptions, commission config, payouts.
 * All commission logic server-side only. Duplicate prevention via subscription_payments.
 */

import { createAdminClient } from "@/lib/supabase";

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

export type MembershipTier = "starter" | "pro" | "elite" | "vip";

export interface CommissionConfigRow {
  membership_tier: string;
  commission_percentage: number;
  updated_at: string;
}

/** Get commission percentage per tier (admin config). */
export async function getCommissionConfig(): Promise<CommissionConfigRow[]> {
  const { data, error } = await supabase()
    .from("referral_commission_config")
    .select("*")
    .order("membership_tier");
  if (error) throw error;
  return (data ?? []) as CommissionConfigRow[];
}

/** Set commission percentage for a tier (admin only). */
export async function setCommissionPercentage(
  tier: MembershipTier,
  percentage: number
): Promise<void> {
  if (percentage < 0 || percentage > 100) throw new Error("Invalid percentage");
  const { error } = await supabase()
    .from("referral_commission_config")
    .upsert(
      { membership_tier: tier, commission_percentage: percentage, updated_at: new Date().toISOString() },
      { onConflict: "membership_tier" }
    );
  if (error) throw error;
}

/** Process all due subscription billings and pay commissions (monthly cron). */
export async function processAllDueReferralCommissions(): Promise<{
  success: boolean;
  processed: number;
  commissionsPaid: number;
}> {
  const { data, error } = await supabase().rpc("process_all_due_referral_commissions");
  if (error) throw error;
  const r = data as { success: boolean; processed?: number; commissionsPaid?: number };
  return {
    success: r.success,
    processed: r.processed ?? 0,
    commissionsPaid: r.commissionsPaid ?? 0,
  };
}

/** Process one subscription billing (admin/test). Returns result from DB. */
export async function processSubscriptionBilling(subscriptionId: string): Promise<{
  success: boolean;
  message?: string;
  commissionPaid?: boolean;
  commissionCents?: number;
  referrerId?: string;
  reason?: string;
}> {
  const { data, error } = await supabase().rpc("process_subscription_billing", {
    p_subscription_id: subscriptionId,
  });
  if (error) throw error;
  return data as {
    success: boolean;
    message?: string;
    commissionPaid?: boolean;
    commissionCents?: number;
    referrerId?: string;
    reason?: string;
  };
}

/** User: active referral subscriptions count (referred users with active subscription). */
export async function getActiveReferralSubscriptionsCount(userId: string): Promise<number> {
  const { data: user } = await supabase().from("users").select("referral_code").eq("id", userId).single();
  const code = (user as { referral_code?: string } | null)?.referral_code;
  if (!code) return 0;
  const { data: referred } = await supabase()
    .from("users")
    .select("id")
    .eq("referred_by_code", code);
  const referredIds = (referred ?? []).map((r: { id: string }) => r.id);
  if (referredIds.length === 0) return 0;
  const { count, error } = await supabase()
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .in("user_id", referredIds)
    .eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}

/** User: monthly referral commission income (current month, from transactions type=referral_commission). */
export async function getMonthlyReferralCommissionCents(userId: string): Promise<number> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();
  const { data, error } = await supabase()
    .from("transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "referral_commission")
    .eq("status", "completed")
    .gte("created_at", startIso);
  if (error) throw error;
  return (data ?? []).reduce((sum, r) => sum + Number((r as { amount: number }).amount), 0);
}

/** User: lifetime referral commission income. */
export async function getLifetimeReferralCommissionCents(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from("transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "referral_commission")
    .eq("status", "completed");
  if (error) throw error;
  return (data ?? []).reduce((sum, r) => sum + Number((r as { amount: number }).amount), 0);
}

/** User: list active referral commission rows (referred user, tier, amount per month). */
export async function getActiveReferralCommissionsForUser(userId: string): Promise<
  { referredUserId: string; subscriptionId: string; membershipTier: string; commissionAmountCents: number; lastPaidDate: string | null }[]
> {
  const { data, error } = await supabase()
    .from("referral_commissions")
    .select("referred_user_id, subscription_id, commission_amount, last_paid_date")
    .eq("referrer_user_id", userId)
    .eq("status", "active");
  if (error) throw error;
  const rows = (data ?? []) as { referred_user_id: string; subscription_id: string; commission_amount: number; last_paid_date: string | null }[];
  if (rows.length === 0) return [];
  const subIds = Array.from(new Set(rows.map((r) => r.subscription_id)));
  const { data: subs } = await supabase().from("subscriptions").select("id, membership_tier").in("id", subIds);
  const subMap = new Map((subs ?? []).map((s: { id: string; membership_tier: string }) => [s.id, s.membership_tier]));
  return rows.map((r) => ({
    referredUserId: r.referred_user_id,
    subscriptionId: r.subscription_id,
    membershipTier: subMap.get(r.subscription_id) ?? "starter",
    commissionAmountCents: Number(r.commission_amount),
    lastPaidDate: r.last_paid_date,
  }));
}

/** Admin: total recurring commissions paid (sum of transactions type=referral_commission). */
export async function getTotalRecurringCommissionsPaidCents(): Promise<number> {
  const { data, error } = await supabase()
    .from("transactions")
    .select("amount")
    .eq("type", "referral_commission")
    .eq("status", "completed");
  if (error) throw error;
  return (data ?? []).reduce((sum, r) => sum + Number((r as { amount: number }).amount), 0);
}

/** Admin: count of active referral subscriptions (subscriptions where user was referred and status=active). */
export async function getActiveReferralSubscriptionsCountAdmin(): Promise<number> {
  const { data: commissions } = await supabase()
    .from("referral_commissions")
    .select("subscription_id")
    .eq("status", "active");
  const subIds = Array.from(new Set((commissions ?? []).map((c: { subscription_id: string }) => c.subscription_id)));
  if (subIds.length === 0) return 0;
  const { count, error } = await supabase()
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .in("id", subIds)
    .eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}
