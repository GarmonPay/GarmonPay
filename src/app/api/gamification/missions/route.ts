import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getMissionsConfig, getMissionCompletionsToday } from "@/lib/gamification-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/gamification/missions — list missions and user progress today. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!createAdminClient()) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const missions = await getMissionsConfig();
  const progress = await Promise.all(
    missions.map(async (m) => ({
      code: m.code,
      name: m.name,
      rewardCents: m.rewardCents,
      dailyLimit: m.dailyLimitPerUser,
      completedToday: await getMissionCompletionsToday(userId, m.code),
    }))
  );
  return NextResponse.json({ missions: progress });
}
