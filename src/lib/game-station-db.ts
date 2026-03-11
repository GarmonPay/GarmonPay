/**
 * Game Station: global and per-game leaderboards from game_station_scores.
 * Pinball also has its own pinball_scores; we can sync or use both.
 */

import { createAdminClient } from "@/lib/supabase";
import { getPinballLeaderboardAllTime, getPinballLeaderboardWeekly } from "@/lib/pinball-db";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export type GameSlug =
  | "pinball"
  | "boxing"
  | "runner"
  | "snake"
  | "shooter"
  | "dodge"
  | "tap"
  | "spin"
  | "memory"
  | "reaction";

export function getWeeklyKey(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((now.getTime() - start.getTime()) / 86400000) + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  score: number;
  email?: string;
}

/** Insert a score for a game (e.g. runner, snake). Pinball uses pinball_scores separately. */
export async function insertGameScore(
  gameSlug: GameSlug,
  userId: string,
  score: number
): Promise<void> {
  const weeklyKey = getWeeklyKey();
  const { error } = await supabase()
    .from("game_station_scores")
    .insert({ game_slug: gameSlug, user_id: userId, score, weekly_key: weeklyKey });
  if (error) throw error;
}

/** Top N for a single game (all-time: best score per user). */
export async function getGameLeaderboard(
  gameSlug: GameSlug,
  limit = 10
): Promise<LeaderboardEntry[]> {
  const { data: scores, error } = await supabase()
    .from("game_station_scores")
    .select("user_id, score")
    .eq("game_slug", gameSlug)
    .order("score", { ascending: false })
    .limit(limit * 3);
  if (error) return [];
  const byUser = new Map<string, number>();
  for (const row of scores ?? []) {
    const r = row as { user_id: string; score: number };
    const best = byUser.get(r.user_id);
    if (best == null || r.score > best) byUser.set(r.user_id, r.score);
  }
  const sorted = Array.from(byUser.entries())
    .map(([user_id, score]) => ({ user_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const userIds = sorted.map((s) => s.user_id);
  const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
  const emailMap = new Map((users ?? []).map((u: { id: string; email?: string }) => [u.id, u.email]));
  return sorted.map((s, i) => ({
    rank: i + 1,
    user_id: s.user_id,
    score: s.score,
    email: emailMap.get(s.user_id) ?? "—",
  }));
}

/** Weekly top N for a single game. */
export async function getGameLeaderboardWeekly(
  gameSlug: GameSlug,
  limit = 10
): Promise<LeaderboardEntry[]> {
  const weeklyKey = getWeeklyKey();
  const { data: scores, error } = await supabase()
    .from("game_station_scores")
    .select("user_id, score")
    .eq("game_slug", gameSlug)
    .eq("weekly_key", weeklyKey)
    .order("score", { ascending: false })
    .limit(limit * 3);
  if (error) return [];
  const byUser = new Map<string, number>();
  for (const row of scores ?? []) {
    const r = row as { user_id: string; score: number };
    const best = byUser.get(r.user_id);
    if (best == null || r.score > best) byUser.set(r.user_id, r.score);
  }
  const sorted = Array.from(byUser.entries())
    .map(([user_id, score]) => ({ user_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const userIds = sorted.map((s) => s.user_id);
  const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
  const emailMap = new Map((users ?? []).map((u: { id: string; email?: string }) => [u.id, u.email]));
  return sorted.map((s, i) => ({
    rank: i + 1,
    user_id: s.user_id,
    score: s.score,
    email: emailMap.get(s.user_id) ?? "—",
  }));
}

/** Global leaderboard: sum of best score per game per user. Includes pinball from pinball_scores. */
export async function getGlobalLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const [pinballAll, { data: scores, error }] = await Promise.all([
    getPinballLeaderboardAllTime(500),
    supabase().from("game_station_scores").select("user_id, game_slug, score").order("score", { ascending: false }),
  ]);
  const bestPerUserGame = new Map<string, number>();
  for (const e of pinballAll) {
    const key = `${e.user_id}:pinball`;
    const cur = bestPerUserGame.get(key);
    if (cur == null || e.score > cur) bestPerUserGame.set(key, e.score);
  }
  if (!error && scores) {
    for (const row of scores as { user_id: string; game_slug: string; score: number }[]) {
      const key = `${row.user_id}:${row.game_slug}`;
      const cur = bestPerUserGame.get(key);
      if (cur == null || row.score > cur) bestPerUserGame.set(key, row.score);
    }
  }
  const totalByUser = new Map<string, number>();
  Array.from(bestPerUserGame.entries()).forEach(([key, score]) => {
    const userId = key.split(":")[0];
    totalByUser.set(userId, (totalByUser.get(userId) ?? 0) + score);
  });
  const sorted = Array.from(totalByUser.entries())
    .map(([user_id, score]) => ({ user_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const userIds = sorted.map((s) => s.user_id);
  const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
  const emailMap = new Map((users ?? []).map((u: { id: string; email?: string }) => [u.id, u.email]));
  return sorted.map((s, i) => ({
    rank: i + 1,
    user_id: s.user_id,
    score: s.score,
    email: emailMap.get(s.user_id) ?? "—",
  }));
}

/** Weekly global: include pinball weekly + game_station_scores weekly. */
export async function getGlobalLeaderboardWeekly(limit = 10): Promise<LeaderboardEntry[]> {
  const weeklyKey = getWeeklyKey();
  const [pinballWeekly, { data: scores, error }] = await Promise.all([
    getPinballLeaderboardWeekly(500),
    supabase().from("game_station_scores").select("user_id, game_slug, score").eq("weekly_key", weeklyKey).order("score", { ascending: false }),
  ]);
  const bestPerUserGame = new Map<string, number>();
  for (const e of pinballWeekly) {
    const key = `${e.user_id}:pinball`;
    const cur = bestPerUserGame.get(key);
    if (cur == null || e.score > cur) bestPerUserGame.set(key, e.score);
  }
  if (!error && scores) {
    for (const row of scores as { user_id: string; game_slug: string; score: number }[]) {
      const key = `${row.user_id}:${row.game_slug}`;
      const cur = bestPerUserGame.get(key);
      if (cur == null || row.score > cur) bestPerUserGame.set(key, row.score);
    }
  }
  const totalByUser = new Map<string, number>();
  Array.from(bestPerUserGame.entries()).forEach(([key, score]) => {
    const userId = key.split(":")[0];
    totalByUser.set(userId, (totalByUser.get(userId) ?? 0) + score);
  });
  const sorted = Array.from(totalByUser.entries())
    .map(([user_id, score]) => ({ user_id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const userIds = sorted.map((s) => s.user_id);
  const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
  const emailMap = new Map((users ?? []).map((u: { id: string; email?: string }) => [u.id, u.email]));
  return sorted.map((s, i) => ({
    rank: i + 1,
    user_id: s.user_id,
    score: s.score,
    email: emailMap.get(s.user_id) ?? "—",
  }));
}

/** User rank on global leaderboard (1-based). */
export async function getGlobalRank(userId: string): Promise<number | null> {
  const all = await getGlobalLeaderboard(500);
  const idx = all.findIndex((e) => e.user_id === userId);
  return idx >= 0 ? idx + 1 : null;
}
