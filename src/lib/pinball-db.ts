/**
 * Pinball: sessions (pay-to-play) and scores for leaderboard.
 */

import { createAdminClient } from "@/lib/supabase";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

/** Current week key YYYY-Www for weekly leaderboard. */
export function getWeeklyKey(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((now.getTime() - start.getTime()) / 86400000) + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export interface PinballSessionRow {
  id: string;
  user_id: string;
  created_at: string;
}

export async function createPinballSession(userId: string): Promise<PinballSessionRow> {
  const { data, error } = await supabase()
    .from("pinball_sessions")
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as PinballSessionRow;
}

export async function canSubmitScoreForSession(sessionId: string, userId: string): Promise<boolean> {
  const { data: session, error: sErr } = await supabase()
    .from("pinball_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sErr || !session) return false;
  const { data: existing } = await supabase()
    .from("pinball_scores")
    .select("id")
    .eq("session_id", sessionId)
    .limit(1)
    .maybeSingle();
  return !existing;
}

export async function insertPinballScore(
  userId: string,
  sessionId: string,
  score: number
): Promise<void> {
  const weeklyKey = getWeeklyKey();
  const { error } = await supabase()
    .from("pinball_scores")
    .insert({ user_id: userId, session_id: sessionId, score, weekly_key: weeklyKey });
  if (error) throw error;
}

export async function getPinballLeaderboardAllTime(limit = 10): Promise<
  { rank: number; user_id: string; score: number; email?: string }[]
> {
  const { data: scores, error } = await supabase()
    .from("pinball_scores")
    .select("user_id, score")
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

export async function getPinballLeaderboardWeekly(limit = 10): Promise<
  { rank: number; user_id: string; score: number; email?: string }[]
> {
  const weeklyKey = getWeeklyKey();
  const { data: scores, error } = await supabase()
    .from("pinball_scores")
    .select("user_id, score")
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

export async function getUserPinballStats(userId: string): Promise<{
  bestScore: number;
  rank: number | null;
  gamesPlayed: number;
}> {
  const { data: userScores } = await supabase()
    .from("pinball_scores")
    .select("score")
    .eq("user_id", userId);
  const scores = (userScores ?? []) as { score: number }[];
  const gamesPlayed = scores.length;
  const bestScore = scores.length ? Math.max(...scores.map((s) => s.score)) : 0;
  if (bestScore === 0) return { bestScore: 0, rank: null, gamesPlayed };
  const { count } = await supabase()
    .from("pinball_scores")
    .select("id", { count: "exact", head: true })
    .gt("score", bestScore);
  const rank = typeof count === "number" ? count + 1 : null;
  return { bestScore, rank, gamesPlayed };
}
