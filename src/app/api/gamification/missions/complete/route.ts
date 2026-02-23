import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { completeMission } from "@/lib/gamification-db";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/gamification/missions/complete — complete a mission (body: { missionCode: string }). */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!createAdminClient()) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  let body: { missionCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const missionCode = body.missionCode?.trim();
  if (!missionCode) return NextResponse.json({ message: "missionCode required" }, { status: 400 });

  const result = await completeMission(userId, missionCode);
  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({ success: true, rewardCents: result.rewardCents });
}
