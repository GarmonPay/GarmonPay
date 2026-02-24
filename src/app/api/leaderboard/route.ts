import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getTopReferrers, getTopEarners } from "@/lib/viral-db";
import { createAdminClient } from "@/lib/supabase";
import { getLeaderboard as getLeaderboardFromDb } from "@/lib/leaderboard";

/** GET /api/leaderboard — top referrers and top earners. Auth required. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  try {
    if (admin) {
      const [topReferrers, topEarners] = await Promise.all([
        getTopReferrers(20),
        getTopEarners(20),
      ]);
      return NextResponse.json({ topReferrers: topReferrers ?? [], topEarners: topEarners ?? [] });
    }
    const rows = await getLeaderboardFromDb();
    const mapped = (rows as { id: string; email: string; total_earnings?: number; total_referrals?: number }[]).map((r) => ({
      userId: r.id,
      email: r.email ?? "—",
      totalReferrals: Number(r.total_referrals) ?? 0,
      totalEarningsCents: Number(r.total_earnings) ?? 0,
    }));
    const byEarnings = [...mapped].sort((a, b) => b.totalEarningsCents - a.totalEarningsCents).slice(0, 20);
    const byReferrals = [...mapped].sort((a, b) => b.totalReferrals - a.totalReferrals).slice(0, 20);
    return NextResponse.json({
      topReferrers: byReferrals.map((r) => ({ userId: r.userId, email: r.email, totalReferrals: r.totalReferrals, totalEarningsCents: r.totalEarningsCents })),
      topEarners: byEarnings.map((r) => ({ userId: r.userId, email: r.email, totalEarningsCents: r.totalEarningsCents })),
    });
  } catch (e) {
    console.error("Leaderboard error:", e);
    return NextResponse.json({ topReferrers: [], topEarners: [] });
  }
}
