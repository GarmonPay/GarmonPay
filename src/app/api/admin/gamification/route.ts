import { NextResponse } from "next/server";
import {
  getSpinWheelConfig,
  getMysteryBoxConfig,
  getStreakConfig,
  getMissionsConfig,
  getRanksConfig,
} from "@/lib/gamification-db";
import { getAndMaybeResetGlobalBudget, updateGlobalBudget } from "@/lib/reward-budget";
import { createAdminClient } from "@/lib/supabase";
import { authenticateAdminRequest } from "@/lib/admin-auth";

async function requireAdmin(request: Request): Promise<NextResponse | null> {
  const auth = await authenticateAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }
  return null;
}

/** GET — return all gamification configs and global budget. */
export async function GET(request: Request) {
  const err = await requireAdmin(request);
  if (err) return err;
  if (!createAdminClient()) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  try {
    const [spin, mystery, streak, missions, ranks, globalBudget] = await Promise.all([
      getSpinWheelConfig(),
      getMysteryBoxConfig(),
      getStreakConfig(),
      getMissionsConfig(),
      getRanksConfig(),
      getAndMaybeResetGlobalBudget(),
    ]);
    return NextResponse.json({
      globalBudget: globalBudget ?? null,
      spinWheel: spin,
      mysteryBox: mystery,
      streak,
      missions,
      ranks,
    });
  } catch (e) {
    return NextResponse.json({ message: (e as Error).message }, { status: 500 });
  }
}

/** PATCH — update one or more configs. Body: { globalBudget?, spinWheel?, mysteryBox?, streak?, missions?, ranks? } */
export async function PATCH(request: Request) {
  const err = await requireAdmin(request);
  if (err) return err;
  if (!createAdminClient()) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  if (body.globalBudget && typeof body.globalBudget === "object") {
    const g = body.globalBudget as { dailyBudgetCents?: number; weeklyBudgetCents?: number };
    await updateGlobalBudget({
      dailyBudgetCents: g.dailyBudgetCents,
      weeklyBudgetCents: g.weeklyBudgetCents,
    });
  }

  if (body.spinWheel && typeof body.spinWheel === "object") {
    const s = body.spinWheel as Record<string, unknown>;
    await supabase
      .from("spin_wheel_config")
      .update({
        enabled: s.enabled,
        daily_spin_limit_per_user: s.dailySpinLimitPerUser,
        daily_total_budget_cents: s.dailyTotalBudgetCents,
        reward_balance_cents: s.rewardBalanceCents,
        reward_ad_credit_cents: s.rewardAdCreditCents,
        no_reward_weight: s.noRewardWeight,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
  }

  if (body.mysteryBox && typeof body.mysteryBox === "object") {
    const m = body.mysteryBox as Record<string, unknown>;
    await supabase
      .from("mystery_box_config")
      .update({
        enabled: m.enabled,
        daily_total_budget_cents: m.dailyTotalBudgetCents,
        reward_balance_cents: m.rewardBalanceCents,
        reward_ad_credit_cents: m.rewardAdCreditCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
  }

  if (body.streak && typeof body.streak === "object") {
    const s = body.streak as Record<string, unknown>;
    await supabase
      .from("streak_config")
      .update({
        enabled: s.enabled,
        reward_per_day_cents: s.rewardPerDayCents,
        max_streak_reward_cents: s.maxStreakRewardCents,
        daily_budget_cents: s.dailyBudgetCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
  }

  if (body.missions && Array.isArray(body.missions)) {
    for (const m of body.missions as Array<{ code: string; rewardCents?: number; dailyLimitPerUser?: number; dailyGlobalLimit?: number | null; active?: boolean }>) {
      if (m?.code) {
        await supabase
          .from("mission_config")
          .update({
            reward_cents: m.rewardCents,
            daily_limit_per_user: m.dailyLimitPerUser,
            daily_global_limit: m.dailyGlobalLimit,
            active: m.active,
            updated_at: new Date().toISOString(),
          })
          .eq("code", m.code);
      }
    }
  }

  if (body.ranks && Array.isArray(body.ranks)) {
    for (const r of body.ranks as Array<{ code: string; minEarningsCents?: number; minReferrals?: number; earningsMultiplier?: number }>) {
      if (r?.code) {
        await supabase
          .from("rank_config")
          .update({
            min_earnings_cents: r.minEarningsCents,
            min_referrals: r.minReferrals,
            earnings_multiplier: r.earningsMultiplier,
          })
          .eq("code", r.code);
      }
    }
  }

  return NextResponse.json({ success: true });
}
