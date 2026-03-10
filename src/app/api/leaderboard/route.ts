import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getLeaderboard as getReferralLeaderboard } from "@/lib/viral-referral-db";

/** GET /api/leaderboard — topReferrers, topEarners (for dashboard), and fighters leaderboard. Public. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const sort = searchParams.get("sort") ?? "wins"; // wins | level | earnings

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({
      topReferrers: [],
      topEarners: [],
      leaderboard: [],
    });
  }

  let topReferrers: Array<{ userId: string; email: string; totalReferrals: number; totalEarningsCents: number }> = [];
  let topEarners: Array<{ userId: string; email: string; totalEarningsCents: number }> = [];
  try {
    const refLeaderboard = await getReferralLeaderboard(30);
    topReferrers = refLeaderboard.map((r) => ({
      userId: r.userId,
      email: r.email,
      totalReferrals: r.totalReferrals,
      totalEarningsCents: r.totalEarningsCents,
    }));
    topEarners = [...refLeaderboard]
      .sort((a, b) => b.totalEarningsCents - a.totalEarningsCents)
      .slice(0, 20)
      .map((r) => ({ userId: r.userId, email: r.email, totalEarningsCents: r.totalEarningsCents }));
  } catch {
    // viral tables may be missing
  }

  let orderBy = "wins";
  const ascending = false;
  if (sort === "level") orderBy = "level";
  else if (sort === "earnings") orderBy = "earnings";

  const { data: fighters, error } = await supabase
    .from("fighters")
    .select("id, user_id, name, speed, power, defense, wins, losses, level, earnings")
    .order(orderBy, { ascending })
    .limit(limit);

  if (error) {
    return NextResponse.json({
      topReferrers,
      topEarners,
      leaderboard: [],
    });
  }

  const userIds = Array.from(new Set((fighters ?? []).map((f: { user_id: string }) => f.user_id)));
  const { data: users } = await supabase.from("users").select("id, email").in("id", userIds);
  const emailById = new Map<string, string>();
  for (const u of users ?? []) {
    const r = u as { id: string; email?: string };
    emailById.set(r.id, r.email ?? "—");
  }

  const leaderboard = (fighters ?? []).map((f: Record<string, unknown>, i: number) => ({
    rank: i + 1,
    fighter_id: f.id,
    user_id: f.user_id,
    email: emailById.get(f.user_id as string) ?? "—",
    name: f.name,
    speed: f.speed,
    power: f.power,
    defense: f.defense,
    wins: f.wins,
    losses: f.losses,
    level: f.level,
    earnings_cents: f.earnings,
  }));

  return NextResponse.json({
    topReferrers,
    topEarners,
    leaderboard,
  });
}
