import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { claimDailyReward } from "@/lib/viral-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/daily-reward — claim daily check-in. Once per day, server-verified. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const result = await claimDailyReward(userId);
  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({
    success: true,
    amountCents: result.amountCents,
    message: "Daily reward claimed",
  });
}
