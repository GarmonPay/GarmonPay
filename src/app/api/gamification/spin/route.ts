import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { performSpin } from "@/lib/gamification-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/gamification/spin — perform one spin. Budget and limits enforced server-side. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!createAdminClient()) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const result = await performSpin(userId);
  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({
    success: true,
    rewardType: result.rewardType,
    amountCents: result.amountCents,
  });
}
