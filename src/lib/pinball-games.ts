/**
 * Pinball games, jackpot, leaderboard (new tables).
 */

import { createAdminClient } from "@/lib/supabase";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

const COINS_BY_SCORE: [number, number][] = [
  [250_000, 200],
  [100_000, 100],
  [50_000, 50],
  [10_000, 25],
  [0, 10],
];

export function coinsForFreePlayScore(score: number): number {
  for (const [minScore, coins] of COINS_BY_SCORE) {
    if (score >= minScore) return coins;
  }
  return 10;
}

const MAX_SCORE_PER_MINUTE = 50_000;
const MIN_MS_BETWEEN_HITS = 200;

export function validateFreePlayScore(
  score: number,
  durationSeconds: number,
  hits?: { bumper: string; t: number }[]
): { valid: boolean; reason?: string } {
  if (score < 0 || durationSeconds < 0) return { valid: false, reason: "Invalid score or duration" };
  const maxPossible = Math.ceil((durationSeconds / 60) * MAX_SCORE_PER_MINUTE) + 5000;
  if (score > maxPossible) return { valid: false, reason: "Score exceeds physical maximum" };
  if (hits && hits.length > 0) {
    for (let i = 1; i < hits.length; i++) {
      if (hits[i].t - hits[i - 1].t < MIN_MS_BETWEEN_HITS) {
        return { valid: false, reason: "Hit sequence too fast" };
      }
    }
  }
  return { valid: true };
}

export interface PinballGameRow {
  id: string;
  user_id: string;
  mode: string;
  score: number;
  balls_used: number;
  duration_seconds: number;
  garmon_completions: number;
  jackpot_hit: boolean;
  coins_earned: number;
  cash_earned_cents: number;
  hit_log: unknown;
  created_at: string;
  completed_at: string | null;
}

export async function createPinballGame(
  userId: string,
  mode: "free" | "h2h" | "tournament"
): Promise<PinballGameRow> {
  const { data, error } = await supabase()
    .from("pinball_games")
    .insert({ user_id: userId, mode, score: 0, balls_used: 0, duration_seconds: 0 })
    .select()
    .single();
  if (error) throw error;
  return data as PinballGameRow;
}

export async function getPinballGame(gameId: string, userId: string): Promise<PinballGameRow | null> {
  const { data, error } = await supabase()
    .from("pinball_games")
    .select("*")
    .eq("id", gameId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data as PinballGameRow | null;
}

export async function completePinballGame(
  gameId: string,
  userId: string,
  payload: {
    score: number;
    balls_used: number;
    duration_seconds: number;
    garmon_completions?: number;
    jackpot_hit?: boolean;
    coins_earned: number;
    cash_earned_cents?: number;
    hit_log?: unknown;
  }
): Promise<void> {
  const { error } = await supabase()
    .from("pinball_games")
    .update({
      score: payload.score,
      balls_used: payload.balls_used,
      duration_seconds: payload.duration_seconds,
      garmon_completions: payload.garmon_completions ?? 0,
      jackpot_hit: payload.jackpot_hit ?? false,
      coins_earned: payload.coins_earned,
      cash_earned_cents: payload.cash_earned_cents ?? 0,
      hit_log: payload.hit_log ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", gameId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function upsertPinballLeaderboard(
  userId: string,
  username: string | null,
  score: number,
  isWin?: boolean,
  isLoss?: boolean,
  cashEarnedCents?: number
): Promise<void> {
  const { data: existing } = await supabase()
    .from("pinball_leaderboard")
    .select("id, highest_score, total_score, games_played, wins, losses, total_earned_cents")
    .eq("user_id", userId)
    .maybeSingle();

  const row = existing as {
    id: string;
    highest_score: number;
    total_score: number;
    games_played: number;
    wins: number;
    losses: number;
    total_earned_cents: number;
  } | null;

  const highest = row ? Math.max(row.highest_score, score) : score;
  const total = row ? row.total_score + score : score;
  const games = row ? row.games_played + 1 : 1;
  const wins = row ? row.wins + (isWin ? 1 : 0) : (isWin ? 1 : 0);
  const losses = row ? row.losses + (isLoss ? 1 : 0) : (isLoss ? 1 : 0);
  const totalEarned = row
    ? row.total_earned_cents + (cashEarnedCents ?? 0)
    : (cashEarnedCents ?? 0);

  const level = levelFromTotalScore(total);
  const levelName = LEVEL_NAMES[level] ?? "ROOKIE";

  if (row) {
    const { error } = await supabase()
      .from("pinball_leaderboard")
      .update({
        username,
        highest_score: highest,
        total_score: total,
        games_played: games,
        wins,
        losses,
        total_earned_cents: totalEarned,
        level,
        level_name: levelName,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase()
      .from("pinball_leaderboard")
      .insert({
        user_id: userId,
        username,
        highest_score: highest,
        total_score: total,
        games_played: games,
        wins,
        losses,
        total_earned_cents: totalEarned,
        level,
        level_name: levelName,
      });
    if (error) throw error;
  }
}

const LEVEL_NAMES: Record<number, string> = {
  1: "ROOKIE",
  2: "APPRENTICE",
  3: "HUSTLER",
  4: "SHARPSHOOTER",
  5: "PRO",
  6: "VETERAN",
  7: "ELITE",
  8: "MASTER",
  9: "LEGEND",
  10: "GARMONPAY GOD",
};

const LEVEL_MILESTONES = [
  0, 50_000, 150_000, 400_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000,
];

function levelFromTotalScore(totalScore: number): number {
  let level = 1;
  for (let i = LEVEL_MILESTONES.length - 1; i >= 0; i--) {
    if (totalScore >= LEVEL_MILESTONES[i]) return i + 1;
  }
  return level;
}

export async function getPinballLeaderboardNew(limit = 10): Promise<
  { rank: number; user_id: string; username: string | null; highest_score: number; level: number; level_name: string }[]
> {
  const { data, error } = await supabase()
    .from("pinball_leaderboard")
    .select("user_id, username, highest_score, level, level_name")
    .order("highest_score", { ascending: false })
    .limit(limit * 2);
  if (error) return [];
  const rows = (data ?? []) as { user_id: string; username: string | null; highest_score: number; level: number; level_name: string }[];
  return rows.slice(0, limit).map((r, i) => ({
    rank: i + 1,
    user_id: r.user_id,
    username: r.username,
    highest_score: r.highest_score,
    level: r.level,
    level_name: r.level_name,
  }));
}

export async function getJackpotCurrent(): Promise<{
  current_amount_cents: number;
  last_won_at: string | null;
  last_winner_id: string | null;
}> {
  const { data, error } = await supabase()
    .from("pinball_jackpot")
    .select("current_amount_cents, last_won_at, last_winner_id")
    .limit(1)
    .maybeSingle();
  if (error || !data) return { current_amount_cents: 500, last_won_at: null, last_winner_id: null };
  return data as { current_amount_cents: number; last_won_at: string | null; last_winner_id: string | null };
}

export async function getLeaderboardEntry(userId: string): Promise<{
  highest_score: number;
  total_score: number;
  games_played: number;
  level: number;
  level_name: string;
  wins: number;
  losses: number;
} | null> {
  const { data } = await supabase()
    .from("pinball_leaderboard")
    .select("highest_score, total_score, games_played, level, level_name, wins, losses")
    .eq("user_id", userId)
    .maybeSingle();
  return data as typeof data & { highest_score: number } | null;
}
