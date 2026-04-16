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

  let topReferrers: Array<{ userId: string; email: string; totalReferrals: number; totalEarningsGpc: number }> = [];
  let topEarners: Array<{ userId: string; email: string; totalEarningsGpc: number }> = [];
  try {
    const refLeaderboard = await getReferralLeaderboard(30);
    topReferrers = refLeaderboard.map((r) => ({
      userId: r.userId,
      email: r.email,
      totalReferrals: r.totalReferrals,
      totalEarningsGpc: r.totalEarningsGpc,
    }));
    topEarners = [...refLeaderboard]
      .sort((a, b) => b.totalEarningsGpc - a.totalEarningsGpc)
      .slice(0, 20)
      .map((r) => ({ userId: r.userId, email: r.email, totalEarningsGpc: r.totalEarningsGpc }));
  } catch {
    // viral tables may be missing
  }

  return NextResponse.json({
    topReferrers,
    topEarners,
  });
}
