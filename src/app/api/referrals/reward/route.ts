import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { grantDepositBonus } from "@/lib/viral-referral-db";

/**
 * POST /api/referrals/reward
 * Grant deposit bonus ($10 to referrer) when referred user makes first deposit.
 * Body: { referredUserId } or use current user as referred.
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    let body: { referredUserId?: string } = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      // empty body ok
    }
    const referredUserId = body?.referredUserId?.trim() || userId;

    const result = await grantDepositBonus(referredUserId);
    return NextResponse.json({ success: result.granted, referrerId: result.referrerId });
  } catch (e) {
    console.error("Referrals reward error:", e);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
