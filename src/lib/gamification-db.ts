/**
 * Gamification: spin wheel, mystery box, streak, missions, ranks.
 * All rewards server-side only. Budget checks via reward-budget.ts.
 */

import { createAdminClient } from "@/lib/supabase";
import {
  canGrantFromGlobalBudget,
  consumeGlobalBudget,
  type RewardSource,
} from "@/lib/reward-budget";

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

/** Grant balance or ad credit and record transaction. Returns error message or null. */
async function grantReward(
  userId: string,
  source: RewardSource,
  amountCents: number,
  description: string,
  transactionType: "spin_wheel" | "mystery_box" | "streak" | "mission"
): Promise<string | null> {
  if (amountCents <= 0) return null;
  const allowed = await canGrantFromGlobalBudget(amountCents);
  if (!allowed.allowed) return allowed.message ?? "Budget limit reached";

  const { data: user, error: userErr } = await supabase()
    .from("users")
    .select("balance, ad_credit_balance")
    .eq("id", userId)
    .single();
  if (userErr || !user) return "User not found";

  const balance = Number((user as { balance?: number }).balance ?? 0);
  const adCredit = Number((user as { ad_credit_balance?: number }).ad_credit_balance ?? 0);

  await supabase()
    .from("users")
    .update({
      balance: balance + amountCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  await supabase().from("transactions").insert({
    user_id: userId,
    type: transactionType,
    amount: amountCents,
    status: "completed",
    description,
  });
  await consumeGlobalBudget(source, amountCents, userId);
  return null;
}

/** Grant ad credit reward (separate column). */
async function grantAdCreditReward(
  userId: string,
  source: RewardSource,
  amountCents: number,
  description: string,
  transactionType: "spin_wheel" | "mystery_box"
): Promise<string | null> {
  if (amountCents <= 0) return null;
  const allowed = await canGrantFromGlobalBudget(amountCents);
  if (!allowed.allowed) return allowed.message ?? "Budget limit reached";

  const { data: user, error: userErr } = await supabase()
    .from("users")
    .select("ad_credit_balance")
    .eq("id", userId)
    .single();
  if (userErr || !user) return "User not found";

  const adCredit = Number((user as { ad_credit_balance?: number }).ad_credit_balance ?? 0);

  await supabase()
    .from("users")
    .update({
      ad_credit_balance: adCredit + amountCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  await supabase().from("transactions").insert({
    user_id: userId,
    type: transactionType,
    amount: amountCents,
    status: "completed",
    description,
  });
  await consumeGlobalBudget(source, amountCents, userId);
  return null;
}

// ---------- Spin wheel ----------
export interface SpinWheelConfig {
  enabled: boolean;
  dailySpinLimitPerUser: number;
  dailyTotalBudgetCents: number;
  rewardBalanceCents: number[];
  rewardAdCreditCents: number[];
  noRewardWeight: number;
}

export async function getSpinWheelConfig(): Promise<SpinWheelConfig | null> {
  const { data } = await supabase().from("spin_wheel_config").select("*").eq("id", "default").single();
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    enabled: Boolean(d.enabled),
    dailySpinLimitPerUser: Number(d.daily_spin_limit_per_user ?? 1),
    dailyTotalBudgetCents: Number(d.daily_total_budget_cents ?? 5000),
    rewardBalanceCents: Array.isArray(d.reward_balance_cents) ? (d.reward_balance_cents as number[]) : [5, 10, 25, 0],
    rewardAdCreditCents: Array.isArray(d.reward_ad_credit_cents) ? (d.reward_ad_credit_cents as number[]) : [10, 20, 0, 0],
    noRewardWeight: Number(d.no_reward_weight ?? 1),
  };
}

export async function getSpinCountToday(userId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase()
    .from("spin_wheel_spins")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("spin_date", today);
  if (error) return 0;
  return count ?? 0;
}

export async function getSpinWheelDailySpentToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase()
    .from("spin_wheel_spins")
    .select("amount_cents")
    .eq("spin_date", today);
  const rows = (data ?? []) as { amount_cents: number }[];
  return rows.reduce((s, r) => s + Number(r.amount_cents ?? 0), 0);
}

export async function performSpin(userId: string): Promise<
  | { success: true; rewardType: "balance" | "ad_credit" | "none"; amountCents: number }
  | { success: false; message: string }
> {
  const config = await getSpinWheelConfig();
  if (!config || !config.enabled) return { success: false, message: "Spin wheel is disabled" };

  const used = await getSpinCountToday(userId);
  if (used >= config.dailySpinLimitPerUser) {
    return { success: false, message: "Daily spin limit reached" };
  }

  const dailySpent = await getSpinWheelDailySpentToday();
  if (dailySpent >= config.dailyTotalBudgetCents) {
    return { success: false, message: "Daily spin budget reached" };
  }

  type Seg = { type: "balance" | "ad_credit" | "none"; cents: number };
  const segments: Seg[] = [
    ...config.rewardBalanceCents.map((c): Seg => ({ type: "balance", cents: c })),
    ...config.rewardAdCreditCents.map((c): Seg => ({ type: "ad_credit", cents: c })),
  ];
  for (let i = 0; i < config.noRewardWeight; i++) {
    segments.push({ type: "none", cents: 0 });
  }
  const idx = Math.floor(Math.random() * segments.length);
  const seg = segments[idx]!;
  const amountCents = seg.cents ?? 0;

  const today = new Date().toISOString().slice(0, 10);
  await supabase().from("spin_wheel_spins").insert({
    user_id: userId,
    spin_date: today,
    reward_type: seg.type === "none" ? "none" : seg.type,
    amount_cents: amountCents,
  });

  if (seg.type === "balance" && amountCents > 0) {
    const err = await grantReward(userId, "spin_wheel", amountCents, "Spin wheel reward", "spin_wheel");
    if (err) return { success: false, message: err };
  } else if (seg.type === "ad_credit" && amountCents > 0) {
    const err = await grantAdCreditReward(userId, "spin_wheel", amountCents, "Spin wheel ad credit", "spin_wheel");
    if (err) return { success: false, message: err };
  }

  return {
    success: true,
    rewardType: seg.type === "none" ? "none" : seg.type,
    amountCents,
  };
}

// ---------- Mystery box ----------
export interface MysteryBoxConfig {
  enabled: boolean;
  dailyTotalBudgetCents: number;
  rewardBalanceCents: number[];
  rewardAdCreditCents: number[];
}

export async function getMysteryBoxConfig(): Promise<MysteryBoxConfig | null> {
  const { data } = await supabase().from("mystery_box_config").select("*").eq("id", "default").single();
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    enabled: Boolean(d.enabled),
    dailyTotalBudgetCents: Number(d.daily_total_budget_cents ?? 3000),
    rewardBalanceCents: Array.isArray(d.reward_balance_cents) ? (d.reward_balance_cents as number[]) : [10, 25, 50],
    rewardAdCreditCents: Array.isArray(d.reward_ad_credit_cents) ? (d.reward_ad_credit_cents as number[]) : [20, 50],
  };
}

export async function getMysteryBoxDailySpentToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase().from("mystery_box_opens").select("amount_cents").eq("open_date", today);
  const rows = (data ?? []) as { amount_cents: number }[];
  return rows.reduce((s, r) => s + Number(r.amount_cents ?? 0), 0);
}

export async function openMysteryBox(userId: string): Promise<
  | { success: true; rewardType: "balance" | "ad_credit"; amountCents: number }
  | { success: false; message: string }
> {
  const config = await getMysteryBoxConfig();
  if (!config || !config.enabled) return { success: false, message: "Mystery box is disabled" };

  const dailySpent = await getMysteryBoxDailySpentToday();
  const allRewards = [...config.rewardBalanceCents, ...config.rewardAdCreditCents];
  const maxReward = Math.max(0, ...allRewards);
  if (dailySpent + maxReward > config.dailyTotalBudgetCents) {
    return { success: false, message: "Daily mystery box budget reached" };
  }

  const useBalance = Math.random() < 0.6;
  const amounts = useBalance ? config.rewardBalanceCents : config.rewardAdCreditCents;
  const amountCents = amounts[Math.floor(Math.random() * amounts.length)] ?? 0;

  const today = new Date().toISOString().slice(0, 10);
  await supabase().from("mystery_box_opens").insert({
    user_id: userId,
    open_date: today,
    reward_type: useBalance ? "balance" : "ad_credit",
    amount_cents: amountCents,
  });

  if (amountCents > 0) {
    if (useBalance) {
      const err = await grantReward(userId, "mystery_box", amountCents, "Mystery box reward", "mystery_box");
      if (err) return { success: false, message: err };
    } else {
      const err = await grantAdCreditReward(userId, "mystery_box", amountCents, "Mystery box ad credit", "mystery_box");
      if (err) return { success: false, message: err };
    }
  }

  return {
    success: true,
    rewardType: useBalance ? "balance" : "ad_credit",
    amountCents,
  };
}

// ---------- Streak ----------
export interface StreakConfig {
  enabled: boolean;
  rewardPerDayCents: number;
  maxStreakRewardCents: number;
  dailyBudgetCents: number;
}

export async function getStreakConfig(): Promise<StreakConfig | null> {
  const { data } = await supabase().from("streak_config").select("*").eq("id", "default").single();
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    enabled: Boolean(d.enabled),
    rewardPerDayCents: Number(d.reward_per_day_cents ?? 5),
    maxStreakRewardCents: Number(d.max_streak_reward_cents ?? 100),
    dailyBudgetCents: Number(d.daily_budget_cents ?? 2000),
  };
}

export async function getOrCreateUserStreak(userId: string): Promise<{ lastLoginDate: string | null; currentStreakDays: number }> {
  const { data } = await supabase().from("user_streaks").select("last_login_date, current_streak_days").eq("user_id", userId).maybeSingle();
  if (!data) {
    await supabase().from("user_streaks").upsert({ user_id: userId, current_streak_days: 0 }, { onConflict: "user_id" });
    return { lastLoginDate: null, currentStreakDays: 0 };
  }
  const d = data as { last_login_date: string | null; current_streak_days: number };
  return {
    lastLoginDate: d.last_login_date ? String(d.last_login_date).slice(0, 10) : null,
    currentStreakDays: Number(d.current_streak_days ?? 0),
  };
}

export async function recordLoginAndClaimStreak(userId: string): Promise<
  | { success: true; streakDays: number; rewardCents: number }
  | { success: false; message: string; streakDays: number }
> {
  const config = await getStreakConfig();
  if (!config || !config.enabled) {
    const s = await getOrCreateUserStreak(userId);
    return { success: false, message: "Streak rewards disabled", streakDays: s.currentStreakDays };
  }

  const today = new Date().toISOString().slice(0, 10);
  const streak = await getOrCreateUserStreak(userId);
  let newStreak = streak.currentStreakDays;
  const last = streak.lastLoginDate;

  if (!last) {
    newStreak = 1;
  } else {
    const lastDate = new Date(last);
    const todayDate = new Date(today);
    const diffDays = Math.round((todayDate.getTime() - lastDate.getTime()) / 86400000);
    if (diffDays === 0) {
      await supabase().from("user_streaks").update({ updated_at: new Date().toISOString() }).eq("user_id", userId);
      return { success: false, message: "Already logged in today", streakDays: newStreak };
    }
    if (diffDays === 1) newStreak += 1;
    else newStreak = 1;
  }

  const rewardCents = Math.min(config.rewardPerDayCents * newStreak, config.maxStreakRewardCents);
  if (rewardCents <= 0) {
    await supabase()
      .from("user_streaks")
      .upsert(
        { user_id: userId, last_login_date: today, current_streak_days: newStreak, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    return { success: true, streakDays: newStreak, rewardCents: 0 };
  }

  const allowed = await canGrantFromGlobalBudget(rewardCents);
  if (!allowed.allowed) {
    await supabase()
      .from("user_streaks")
      .upsert(
        { user_id: userId, last_login_date: today, current_streak_days: newStreak, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    return { success: false, message: allowed.message ?? "Budget reached", streakDays: newStreak };
  }

  const err = await grantReward(userId, "streak", rewardCents, `Streak ${newStreak} day reward`, "streak");
  if (err) {
    await supabase()
      .from("user_streaks")
      .upsert(
        { user_id: userId, last_login_date: today, current_streak_days: newStreak, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    return { success: false, message: err, streakDays: newStreak };
  }

  await supabase()
    .from("user_streaks")
    .upsert(
      { user_id: userId, last_login_date: today, current_streak_days: newStreak, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  return { success: true, streakDays: newStreak, rewardCents };
}

// ---------- Missions ----------
export interface MissionConfigRow {
  code: string;
  name: string;
  rewardCents: number;
  dailyLimitPerUser: number;
  dailyGlobalLimit: number | null;
  active: boolean;
}

export async function getMissionsConfig(): Promise<MissionConfigRow[]> {
  const { data } = await supabase().from("mission_config").select("code, name, reward_cents, daily_limit_per_user, daily_global_limit, active").eq("active", true);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    code: String(r.code),
    name: String(r.name),
    rewardCents: Number(r.reward_cents ?? 0),
    dailyLimitPerUser: Number(r.daily_limit_per_user ?? 1),
    dailyGlobalLimit: r.daily_global_limit != null ? Number(r.daily_global_limit) : null,
    active: Boolean(r.active),
  }));
}

export async function getMissionCompletionsToday(userId: string, missionCode: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabase()
    .from("mission_completions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("mission_code", missionCode)
    .eq("completed_date", today);
  return count ?? 0;
}

export async function getMissionCompletionsTodayGlobal(missionCode: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabase()
    .from("mission_completions")
    .select("id", { count: "exact", head: true })
    .eq("mission_code", missionCode)
    .eq("completed_date", today);
  return count ?? 0;
}

export async function completeMission(userId: string, missionCode: string): Promise<
  | { success: true; rewardCents: number }
  | { success: false; message: string }
> {
  const missions = await getMissionsConfig();
  const mission = missions.find((m) => m.code === missionCode);
  if (!mission) return { success: false, message: "Mission not found" };

  const completed = await getMissionCompletionsToday(userId, missionCode);
  if (completed >= mission.dailyLimitPerUser) {
    return { success: false, message: "Daily mission limit reached" };
  }

  if (mission.dailyGlobalLimit != null) {
    const globalCount = await getMissionCompletionsTodayGlobal(missionCode);
    if (globalCount >= mission.dailyGlobalLimit) {
      return { success: false, message: "Mission global limit reached" };
    }
  }

  if (mission.rewardCents <= 0) {
    const today = new Date().toISOString().slice(0, 10);
    await supabase().from("mission_completions").insert({ user_id: userId, mission_code: missionCode, completed_date: today });
    return { success: true, rewardCents: 0 };
  }

  const err = await grantReward(userId, "mission", mission.rewardCents, `Mission: ${mission.name}`, "mission");
  if (err) return { success: false, message: err };

  const today = new Date().toISOString().slice(0, 10);
  await supabase().from("mission_completions").insert({ user_id: userId, mission_code: missionCode, completed_date: today });

  return { success: true, rewardCents: mission.rewardCents };
}

// ---------- Ranks ----------
export interface RankRow {
  code: string;
  name: string;
  sortOrder: number;
  minEarningsCents: number;
  minReferrals: number;
  earningsMultiplier: number;
}

export async function getRanksConfig(): Promise<RankRow[]> {
  const { data } = await supabase().from("rank_config").select("*").order("sort_order", { ascending: true });
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    code: String(r.code),
    name: String(r.name),
    sortOrder: Number(r.sort_order ?? 0),
    minEarningsCents: Number(r.min_earnings_cents ?? 0),
    minReferrals: Number(r.min_referrals ?? 0),
    earningsMultiplier: Number(r.earnings_multiplier ?? 1),
  }));
}

export async function computeUserRank(userId: string): Promise<RankRow | null> {
  const [ranks, txData, refCount] = await Promise.all([
    getRanksConfig(),
    supabase().from("transactions").select("type, amount, status").eq("user_id", userId).in("type", ["earning", "referral"]).eq("status", "completed"),
    supabase().from("referral_bonus").select("id", { count: "exact", head: true }).eq("referrer_id", userId).eq("status", "paid"),
  ]);
  let totalEarnings = 0;
  for (const t of (txData?.data ?? []) as { amount: number }[]) {
    totalEarnings += Number(t.amount ?? 0);
  }
  const referrals = refCount.count ?? 0;
  let best: RankRow | null = null;
  for (const r of ranks) {
    if (totalEarnings >= r.minEarningsCents && referrals >= r.minReferrals) {
      best = r;
    }
  }
  return best;
}

export async function updateUserRank(userId: string): Promise<void> {
  const rank = await computeUserRank(userId);
  if (rank) {
    await supabase().from("users").update({ rank_code: rank.code, updated_at: new Date().toISOString() }).eq("id", userId);
  }
}
