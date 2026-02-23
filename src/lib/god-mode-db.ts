/**
 * God-mode / owner dashboard: platform stats, activity feed, owner flags.
 * Only super admin may access. Use from API with service role.
 */

import { createAdminClient } from "@/lib/supabase";
import { getPlatformTotals } from "@/lib/transactions-db";
import { listAllWithdrawals } from "@/lib/withdrawals-db";

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

export interface GodModeStats {
  totalUserBalanceCents: number;
  totalAdCreditBalanceCents: number;
  totalWithdrawalsPendingCents: number;
  totalWithdrawalsCompletedCents: number;
  totalPlatformEarningsCents: number;
  totalPlatformWithdrawalsCents: number;
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  recentRegistrations: { id: string; email: string; created_at: string }[];
  recentAdEarnings: { user_id: string; amount: number; created_at: string }[];
  recentWithdrawals: { id: string; user_id: string; amount: number; status: string; created_at: string }[];
}

export interface OwnerFlags {
  pause_ads: boolean;
  pause_withdrawals: boolean;
  maintenance_mode: boolean;
}

/** Aggregate platform financial and user stats + live activity. */
export async function getGodModeStats(): Promise<GodModeStats> {
  const sb = supabase();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [totals, withdrawals, usersRes, recentUsersRes, recentEarningsRes, recentWithdrawalsRes] = await Promise.all([
    getPlatformTotals(),
    listAllWithdrawals(),
    sb.from("users").select("id, balance, ad_credit_balance, created_at"),
    sb.from("users").select("id, email, created_at").order("created_at", { ascending: false }).limit(15),
    sb.from("earnings").select("user_id, amount, created_at").eq("source", "ad").order("created_at", { ascending: false }).limit(15),
    sb.from("withdrawals").select("id, user_id, amount, status, created_at").order("created_at", { ascending: false }).limit(15),
  ]);

  const users = (usersRes?.data ?? []) as { id: string; balance: number; ad_credit_balance: number; created_at: string }[];
  let totalUserBalanceCents = 0;
  let totalAdCreditBalanceCents = 0;
  let activeUsers = 0;
  let newUsersToday = 0;
  for (const u of users) {
    totalUserBalanceCents += Number(u.balance ?? 0);
    totalAdCreditBalanceCents += Number(u.ad_credit_balance ?? 0);
    if (Number(u.balance ?? 0) > 0 || Number(u.ad_credit_balance ?? 0) > 0) activeUsers += 1;
    if (u.created_at >= todayIso) newUsersToday += 1;
  }

  let totalWithdrawalsPendingCents = 0;
  let totalWithdrawalsCompletedCents = 0;
  for (const w of withdrawals) {
    const amt = Number(w.amount);
    if (w.status === "pending") totalWithdrawalsPendingCents += amt;
    if (w.status === "approved" || w.status === "paid") totalWithdrawalsCompletedCents += amt;
  }

  const recentRegistrations = (recentUsersRes?.data ?? []).map((r: { id: string; email: string; created_at: string }) => ({
    id: r.id,
    email: r.email,
    created_at: r.created_at,
  }));
  const recentAdEarnings = (recentEarningsRes?.data ?? []).map((r: { user_id: string; amount: number; created_at: string }) => ({
    user_id: r.user_id,
    amount: Number(r.amount),
    created_at: r.created_at,
  }));
  const recentWithdrawalsList = (recentWithdrawalsRes?.data ?? []).map((r: { id: string; user_id: string; amount: number; status: string; created_at: string }) => ({
    id: r.id,
    user_id: r.user_id,
    amount: Number(r.amount),
    status: r.status,
    created_at: r.created_at,
  }));

  return {
    totalUserBalanceCents,
    totalAdCreditBalanceCents,
    totalWithdrawalsPendingCents,
    totalWithdrawalsCompletedCents,
    totalPlatformEarningsCents: totals.totalEarningsCents,
    totalPlatformWithdrawalsCents: totals.totalWithdrawalsCents,
    totalUsers: users.length,
    activeUsers,
    newUsersToday,
    recentRegistrations,
    recentAdEarnings,
    recentWithdrawals: recentWithdrawalsList,
  };
}

/** Platform profit: earnings paid out vs withdrawn (simplified: total completed withdrawals as "completed"). */
export function getPlatformProfitCents(stats: GodModeStats): number {
  return Math.max(0, stats.totalPlatformWithdrawalsCents - stats.totalPlatformEarningsCents);
}

/** Get owner flags. */
export async function getOwnerFlags(): Promise<OwnerFlags> {
  const { data, error } = await supabase().from("owner_config").select("pause_ads, pause_withdrawals, maintenance_mode").eq("id", "default").single();
  if (error || !data) {
    return { pause_ads: false, pause_withdrawals: false, maintenance_mode: false };
  }
  const r = data as { pause_ads: boolean; pause_withdrawals: boolean; maintenance_mode: boolean };
  return {
    pause_ads: !!r.pause_ads,
    pause_withdrawals: !!r.pause_withdrawals,
    maintenance_mode: !!r.maintenance_mode,
  };
}

/** Update owner flags (only one key at a time or all). */
export async function updateOwnerFlags(flags: Partial<OwnerFlags>): Promise<OwnerFlags> {
  const updates: Record<string, boolean | string> = {};
  if (typeof flags.pause_ads === "boolean") updates.pause_ads = flags.pause_ads;
  if (typeof flags.pause_withdrawals === "boolean") updates.pause_withdrawals = flags.pause_withdrawals;
  if (typeof flags.maintenance_mode === "boolean") updates.maintenance_mode = flags.maintenance_mode;
  if (Object.keys(updates).length === 0) return getOwnerFlags();
  updates.updated_at = new Date().toISOString();
  const { error } = await supabase().from("owner_config").update(updates).eq("id", "default");
  if (error) throw error;
  return getOwnerFlags();
}
