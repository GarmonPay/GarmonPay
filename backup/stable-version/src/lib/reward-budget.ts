/**
 * Global reward budget protection. All gamification rewards must check and consume this.
 * Prevents platform loss when daily/weekly budget is reached.
 */

import { createAdminClient } from "@/lib/supabase";

export type RewardSource = "spin_wheel" | "mystery_box" | "streak" | "mission";

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

export interface GlobalBudgetState {
  dailyBudgetCents: number;
  weeklyBudgetCents: number;
  dailyUsedCents: number;
  weeklyUsedCents: number;
  dailyResetAt: string;
  weeklyResetAt: string;
}

/** Get current global budget state; resets daily/weekly if new period. */
export async function getAndMaybeResetGlobalBudget(): Promise<GlobalBudgetState | null> {
  const { data: row, error } = await supabase()
    .from("reward_budget_global")
    .select("*")
    .eq("id", "default")
    .single();
  if (error || !row) return null;
  const today = new Date().toISOString().slice(0, 10);
  const rowAny = row as Record<string, unknown>;
  let dailyResetAt = String(rowAny.daily_reset_at ?? today).slice(0, 10);
  let weeklyResetAt = String(rowAny.weekly_reset_at ?? today).slice(0, 10);
  let dailyUsed = Number(rowAny.daily_used_cents ?? 0);
  let weeklyUsed = Number(rowAny.weekly_used_cents ?? 0);

  const needDailyReset = dailyResetAt < today;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const needWeeklyReset = weeklyResetAt < weekStartStr;

  if (needDailyReset || needWeeklyReset) {
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (needDailyReset) {
      updates.daily_used_cents = 0;
      updates.daily_reset_at = today;
      dailyUsed = 0;
      dailyResetAt = today;
    }
    if (needWeeklyReset) {
      updates.weekly_used_cents = 0;
      updates.weekly_reset_at = weekStartStr;
      weeklyUsed = 0;
      weeklyResetAt = weekStartStr;
    }
    await supabase().from("reward_budget_global").update(updates).eq("id", "default");
  }

  return {
    dailyBudgetCents: Number(rowAny.daily_budget_cents ?? 0),
    weeklyBudgetCents: Number(rowAny.weekly_budget_cents ?? 0),
    dailyUsedCents: dailyUsed,
    weeklyUsedCents: weeklyUsed,
    dailyResetAt,
    weeklyResetAt,
  };
}

/** Check if we can grant amount_cents without exceeding global budget. */
export async function canGrantFromGlobalBudget(amountCents: number): Promise<{
  allowed: boolean;
  message?: string;
}> {
  const budget = await getAndMaybeResetGlobalBudget();
  if (!budget) return { allowed: false, message: "Budget not configured" };
  if (budget.dailyUsedCents + amountCents > budget.dailyBudgetCents) {
    return { allowed: false, message: "Daily reward budget reached" };
  }
  if (budget.weeklyUsedCents + amountCents > budget.weeklyBudgetCents) {
    return { allowed: false, message: "Weekly reward budget reached" };
  }
  return { allowed: true };
}

/** Consume amount from global budget and log spend. Call after successfully granting reward. */
export async function consumeGlobalBudget(
  source: RewardSource,
  amountCents: number,
  userId: string
): Promise<void> {
  await getAndMaybeResetGlobalBudget();
  await supabase().from("reward_spend_log").insert({
    source,
    amount_cents: amountCents,
    user_id: userId,
  });
  const { data: row } = await supabase()
    .from("reward_budget_global")
    .select("daily_used_cents, weekly_used_cents")
    .eq("id", "default")
    .single();
  if (row) {
    const r = row as { daily_used_cents: number; weekly_used_cents: number };
    await supabase()
      .from("reward_budget_global")
      .update({
        daily_used_cents: (r.daily_used_cents ?? 0) + amountCents,
        weekly_used_cents: (r.weekly_used_cents ?? 0) + amountCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
  }
}

/** Admin: update global budget limits. */
export async function updateGlobalBudget(limits: {
  dailyBudgetCents?: number;
  weeklyBudgetCents?: number;
}): Promise<boolean> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (limits.dailyBudgetCents !== undefined) updates.daily_budget_cents = limits.dailyBudgetCents;
  if (limits.weeklyBudgetCents !== undefined) updates.weekly_budget_cents = limits.weeklyBudgetCents;
  const { error } = await supabase().from("reward_budget_global").update(updates).eq("id", "default");
  return !error;
}
