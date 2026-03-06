import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getMyReferrals } from "@/lib/viral-referral-db";

/**
 * GET /api/referrals/my-referrals
 * Returns current user's referred users (from viral_referrals).
 */
export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const referrals = await getMyReferrals(userId);
    return NextResponse.json({ referrals });
  } catch (e) {
    console.error("My referrals error:", e);
    return NextResponse.json({ referrals: [] });
  }
}
