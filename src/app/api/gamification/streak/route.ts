import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { recordLoginAndClaimStreak, getOrCreateUserStreak, completeMission } from "@/lib/gamification-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/gamification/streak — get current streak (no claim). */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!createAdminClient()) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const streak = await getOrCreateUserStreak(userId);
  return NextResponse.json({ lastLoginDate: streak.lastLoginDate, currentStreakDays: streak.currentStreakDays });
}

/** POST /api/gamification/streak — record login and claim streak reward if eligible. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!createAdminClient()) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const result = await recordLoginAndClaimStreak(userId);
  if (result.success) {
    completeMission(userId, "login_daily").catch(() => {});
  }
  if (!result.success && result.message !== "Already logged in today") {
    return NextResponse.json({ message: result.message, streakDays: result.streakDays }, { status: 400 });
  }
  return NextResponse.json({
    success: result.success,
    streakDays: result.success ? result.streakDays : result.streakDays,
    rewardCents: result.success ? result.rewardCents : 0,
    message: result.success ? undefined : result.message,
  });
}
