import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getRewardBudget } from "@/lib/games-rewards-db";

/** GET /api/games/budget — current reward budget status (for "No rewards remaining today"). */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const budget = await getRewardBudget();
  if (!budget) return NextResponse.json({ daily_limit: 0, daily_used: 0, remaining: 0, noRewardsRemaining: true });
  const remaining = Math.max(0, budget.daily_limit - budget.daily_used);
  return NextResponse.json({
    daily_limit: budget.daily_limit,
    daily_used: budget.daily_used,
    remaining,
    noRewardsRemaining: remaining <= 0,
  });
}
