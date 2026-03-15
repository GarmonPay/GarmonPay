import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getLeaderboard as getReferralLeaderboard } from "@/lib/viral-referral-db";

/** GET /api/leaderboard — topReferrers, topEarners (for dashboard). Public. */
export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({
      topReferrers: [],
      topEarners: [],
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

  return NextResponse.json({
    topReferrers,
    topEarners,
  });
}
