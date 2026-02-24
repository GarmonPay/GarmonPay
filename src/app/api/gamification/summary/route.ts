import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  getSpinWheelConfig,
  getSpinCountToday,
  getMysteryBoxConfig,
  getOrCreateUserStreak,
  getMissionsConfig,
  getMissionCompletionsToday,
  getRanksConfig,
  computeUserRank,
} from "@/lib/gamification-db";
import { createAdminClient } from "@/lib/supabase";

const emptySummary = {
  spinWheel: null as { enabled: boolean; dailyLimit: number; usedToday: number } | null,
  mysteryBox: null as { enabled: boolean } | null,
  streak: { lastLoginDate: null as string | null, currentStreakDays: 0 },
  missions: [] as { code: string; name: string; rewardCents: number; dailyLimit: number; completedToday: number }[],
  rank: null as { code: string; name: string; earningsMultiplier: number } | null,
  ranks: [] as { code: string; name: string }[],
};

/** GET /api/gamification/summary — spin config, streak, missions progress, rank for dashboard. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!createAdminClient()) return NextResponse.json(emptySummary);

  try {
    const [spinConfig, spinCountToday, mysteryConfig, streak, missions, rank, ranksConfig] = await Promise.all([
      getSpinWheelConfig(),
      getSpinCountToday(userId),
      getMysteryBoxConfig(),
      getOrCreateUserStreak(userId),
      getMissionsConfig(),
      computeUserRank(userId),
      getRanksConfig(),
    ]);

    const missionProgress = await Promise.all(
      missions.map((m) =>
        getMissionCompletionsToday(userId, m.code).then((completedToday) => ({
          code: m.code,
          name: m.name,
          rewardCents: m.rewardCents,
          dailyLimit: m.dailyLimitPerUser,
          completedToday,
        }))
      )
    );

    return NextResponse.json({
      spinWheel: spinConfig
        ? { enabled: spinConfig.enabled, dailyLimit: spinConfig.dailySpinLimitPerUser, usedToday: spinCountToday }
        : null,
      mysteryBox: mysteryConfig ? { enabled: mysteryConfig.enabled } : null,
      streak: { lastLoginDate: streak.lastLoginDate, currentStreakDays: streak.currentStreakDays },
      missions: missionProgress,
      rank: rank ? { code: rank.code, name: rank.name, earningsMultiplier: rank.earningsMultiplier } : null,
      ranks: ranksConfig.map((r) => ({ code: r.code, name: r.name })),
    });
  } catch (e) {
    console.error("Gamification summary error:", e);
    return NextResponse.json(emptySummary);
  }
}
