import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { grantReferralBonusForUser } from "@/lib/viral-db";
import { completeMission } from "@/lib/gamification-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/referral-bonus/ensure — ensure referral bonus for this user (referred user). Idempotent, server-side only. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const result = await grantReferralBonusForUser(userId);
  if (result.success && result.referrerId) {
    completeMission(result.referrerId, "refer_user").catch(() => {});
  }
  return NextResponse.json({ granted: result.success, message: result.message });
}
