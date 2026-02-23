import { NextResponse } from "next/server";
import { getActiveReferralCommissionsForUser } from "@/lib/referral-commissions-db";
import { getAuthUserId } from "@/lib/auth-request";

/**
 * GET /api/referral-commissions — current user's active referral commission rows (referred user, tier, amount/month).
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const list = await getActiveReferralCommissionsForUser(userId);
    return NextResponse.json({ commissions: list });
  } catch (e) {
    console.error("Referral commissions list error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}
