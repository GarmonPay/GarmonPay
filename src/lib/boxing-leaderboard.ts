/**
 * Boxing leaderboard: aggregate from fight_history (wins, losses, knockouts, total earnings).
 * Used for homepage and boxing leaderboard API.
 */

import { createAdminClient } from "@/lib/supabase";

export interface FighterLeaderboardEntry {
  user_id: string;
  email: string;
  wins: number;
  losses: number;
  knockouts: number;
  total_earnings_cents: number;
  rank: number;
}

type FightHistoryRow = {
  player1: string | null;
  player2: string | null;
  winner: string | null;
  bet_amount_cents: number;
  platform_fee_cents: number;
  knockout?: boolean;
};

function sb() {
  const c = createAdminClient();
  if (!c) return null;
  return c;
}

/** Get top fighters from fight_history: wins, losses, knockouts, total earnings. Sorted by wins then earnings. */
export async function getBoxingLeaderboard(limit = 10): Promise<FighterLeaderboardEntry[]> {
  const supabase = sb();
  if (!supabase) return [];

  const { data: rows, error } = await supabase
    .from("fight_history")
    .select("player1, player2, winner, bet_amount_cents, platform_fee_cents")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !rows || rows.length === 0) return [];

  const stats = new Map<
    string,
    { wins: number; losses: number; knockouts: number; total_earnings_cents: number }
  >();

  for (const r of rows as FightHistoryRow[]) {
    const p1 = r.player1 ?? "";
    const p2 = r.player2 ?? "";
    const winner = r.winner ?? null;
    const bet = Number(r.bet_amount_cents) || 0;
    const fee = Number(r.platform_fee_cents) || 0;
    const knockout = (r as { knockout?: boolean }).knockout === true || winner !== null;
    const winnerPayout = bet > 0 ? bet * 2 - fee : 0;

    for (const uid of [p1, p2]) {
      if (!uid) continue;
      if (!stats.has(uid)) {
        stats.set(uid, { wins: 0, losses: 0, knockouts: 0, total_earnings_cents: 0 });
      }
      const s = stats.get(uid)!;
      if (winner === uid) {
        s.wins += 1;
        if (knockout) s.knockouts += 1;
        s.total_earnings_cents += winnerPayout;
      } else if (winner !== null || (p1 && p2)) {
        s.losses += 1;
      }
    }
  }

  const sorted = [...stats.entries()]
    .filter(([, s]) => s.wins > 0 || s.losses > 0)
    .sort((a, b) => {
      const [, sA] = a;
      const [, sB] = b;
      if (sB.wins !== sA.wins) return sB.wins - sA.wins;
      return sB.total_earnings_cents - sA.total_earnings_cents;
    })
    .slice(0, limit);

  const userIds = sorted.map(([uid]) => uid);
  const { data: users } = await supabase
    .from("users")
    .select("id, email")
    .in("id", userIds);

  const emailById = new Map<string, string>();
  for (const u of users ?? []) {
    const row = u as { id: string; email?: string };
    emailById.set(row.id, row.email ?? "—");
  }

  return sorted.map(([userId, s], i) => ({
    user_id: userId,
    email: emailById.get(userId) ?? "—",
    wins: s.wins,
    losses: s.losses,
    knockouts: s.knockouts,
    total_earnings_cents: s.total_earnings_cents,
    rank: i + 1,
  }));
}
