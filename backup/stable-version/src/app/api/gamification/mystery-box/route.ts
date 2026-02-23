import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { openMysteryBox } from "@/lib/gamification-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/gamification/mystery-box — open one mystery box. Budget enforced server-side. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!createAdminClient()) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const result = await openMysteryBox(userId);
  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({
    success: true,
    rewardType: result.rewardType,
    amountCents: result.amountCents,
  });
}
