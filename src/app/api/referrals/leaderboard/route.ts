import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/viral-referral-db";

/**
 * GET /api/referrals/leaderboard
 * Returns top referrers: rank, user, total referrals, total earnings. Public (no auth required).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    const leaderboard = await getLeaderboard(limit);
    return NextResponse.json({ leaderboard });
  } catch {
    return NextResponse.json({ leaderboard: [] });
  }
}
