import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getUserGarmonEarningsSummary } from "@/lib/garmon-ads-db";

/** GET /api/ads/earnings — user's ad earnings summary (today, week, month, total, by type). */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await getUserGarmonEarningsSummary(userId);
    return NextResponse.json({
      todayDollars: summary.todayDollars,
      weekDollars: summary.weekDollars,
      monthDollars: summary.monthDollars,
      totalDollars: summary.totalDollars,
      byType: summary.byType,
    });
  } catch (e) {
    console.error("Ads earnings error:", e);
    return NextResponse.json(
      { message: "Failed to load earnings", todayDollars: 0, weekDollars: 0, monthDollars: 0, totalDollars: 0, byType: {} },
      { status: 500 }
    );
  }
}
