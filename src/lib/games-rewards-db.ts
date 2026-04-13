/**
 * Profit-protected games: reward_budget (daily cap) + games_rewards log.
 * Rewards credit GPay Coins via credit_coins (not legacy users.balance).
 */

import { createAdminClient } from "@/lib/supabase";
import { creditCoins } from "@/lib/coins";

const BUDGET_ROW_ID = "default";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export type GameType = "spin_wheel" | "scratch_card" | "mystery_box" | "daily_bonus";

export interface RewardBudgetRow {
  daily_limit: number;
  daily_used: number;
  updated_at: string;
}

/** Get current reward_budget; reset daily_used if new day. */
export async function getRewardBudget(): Promise<RewardBudgetRow | null> {
  const sb = supabase();
  const today = new Date().toISOString().slice(0, 10);
  const { data: row, error } = await sb
    .from("reward_budget")
    .select("daily_limit, daily_used, updated_at")
    .eq("id", BUDGET_ROW_ID)
    .single();
  if (error || !row) return null;
  const r = row as { daily_limit: number; daily_used: number; updated_at: string };
  const lastUpdated = String(r.updated_at).slice(0, 10);
  if (lastUpdated < today) {
    await sb.from("reward_budget").update({ daily_used: 0, updated_at: new Date().toISOString() }).eq("id", BUDGET_ROW_ID);
    return { daily_limit: Number(r.daily_limit), daily_used: 0, updated_at: new Date().toISOString() };
  }
  return { daily_limit: Number(r.daily_limit), daily_used: Number(r.daily_used), updated_at: r.updated_at };
}

/** Check if we can pay amount (daily_used + amount <= daily_limit). Returns message if no rewards remaining. */
export async function canPayReward(amountSc: number): Promise<{ allowed: boolean; message?: string }> {
  const budget = await getRewardBudget();
  if (!budget) return { allowed: false, message: "Reward budget not configured" };
  if (budget.daily_used >= budget.daily_limit) return { allowed: false, message: "No rewards remaining today" };
  if (budget.daily_used + amountSc > budget.daily_limit) return { allowed: false, message: "No rewards remaining today" };
  return { allowed: true };
}

/** Deduct from reward_budget and credit GPay Coins. */
export async function creditGameReward(
  userId: string,
  amountSc: number,
  gameType: GameType
): Promise<{ success: boolean; message?: string }> {
  if (amountSc <= 0) return { success: true };
  const allowed = await canPayReward(amountSc);
  if (!allowed.allowed) return { success: false, message: allowed.message };

  const sb = supabase();
  const ref = `game_reward_${gameType}_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const credit = await creditCoins(
    userId,
    0,
    amountSc,
    `Game reward: ${gameType}`,
    ref,
    gameType
  );
  if (!credit.success) return { success: false, message: credit.message };

  await sb.from("games_rewards").insert({ user_id: userId, game_type: gameType, reward_amount: amountSc });
  const budget = await getRewardBudget();
  if (budget) {
    await sb.from("reward_budget").update({
      daily_used: budget.daily_used + amountSc,
      updated_at: new Date().toISOString(),
    }).eq("id", BUDGET_ROW_ID);
  }
  return { success: true };
}

/** Spin wheel chances (GPC): 0(50%), 1(25%), 2(15%), 5(8%), 10(2%). */
const SPIN_CHANCES: { sc: number; pct: number }[] = [
  { sc: 0, pct: 50 },
  { sc: 1, pct: 25 },
  { sc: 2, pct: 15 },
  { sc: 5, pct: 8 },
  { sc: 10, pct: 2 },
];

function weightedRandomSc(chances: { sc: number; pct: number }[]): number {
  const r = Math.random() * 100;
  let acc = 0;
  for (const c of chances) {
    acc += c.pct;
    if (r < acc) return c.sc;
  }
  return chances[chances.length - 1].sc;
}

export async function performSpinWheel(userId: string): Promise<{ success: boolean; amountSc: number; message?: string }> {
  const amountSc = weightedRandomSc(SPIN_CHANCES);
  const result = await creditGameReward(userId, amountSc, "spin_wheel");
  return result.success ? { success: true, amountSc } : { success: false, amountSc: 0, message: result.message };
}

/** Scratch card: same budget, random from same distribution. */
export async function performScratchCard(userId: string): Promise<{ success: boolean; amountSc: number; message?: string }> {
  const amountSc = weightedRandomSc(SPIN_CHANCES);
  const result = await creditGameReward(userId, amountSc, "scratch_card");
  return result.success ? { success: true, amountSc } : { success: false, amountSc: 0, message: result.message };
}

/** Mystery box: 50% nothing, 50% random small reward. */
const MYSTERY_CHANCES: { sc: number; pct: number }[] = [
  { sc: 0, pct: 50 },
  { sc: 1, pct: 20 },
  { sc: 2, pct: 15 },
  { sc: 5, pct: 10 },
  { sc: 10, pct: 5 },
];

export async function performMysteryBox(userId: string): Promise<{ success: boolean; amountSc: number; message?: string }> {
  const amountSc = weightedRandomSc(MYSTERY_CHANCES);
  const result = await creditGameReward(userId, amountSc, "mystery_box");
  return result.success ? { success: true, amountSc } : { success: false, amountSc: 0, message: result.message };
}

const DAILY_BONUS_SC = 5;

/** Daily bonus: once per 24 hours per user. */
export async function performDailyBonus(userId: string): Promise<{ success: boolean; amountSc: number; message?: string }> {
  const sb = supabase();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: last } = await sb
    .from("games_rewards")
    .select("id")
    .eq("user_id", userId)
    .eq("game_type", "daily_bonus")
    .gte("created_at", cutoff)
    .limit(1)
    .maybeSingle();
  if (last) return { success: false, amountSc: 0, message: "Already claimed in the last 24 hours" };
  const result = await creditGameReward(userId, DAILY_BONUS_SC, "daily_bonus");
  return result.success ? { success: true, amountSc: DAILY_BONUS_SC } : { success: false, amountSc: 0, message: result.message };
}
