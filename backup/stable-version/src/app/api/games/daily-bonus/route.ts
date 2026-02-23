import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { performDailyBonus } from "@/lib/games-rewards-db";

/** POST /api/games/daily-bonus — claim once per 24h. Server-side only, budget protected. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const result = await performDailyBonus(userId);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Claim failed", amountCents: 0 }, { status: 400 });
  }
  return NextResponse.json({ success: true, amountCents: result.amountCents });
}
