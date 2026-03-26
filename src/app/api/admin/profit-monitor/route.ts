import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { DAILY_PAYOUT_CAPS, PROFIT_SAFETY_THRESHOLD } from "@/lib/profitConfig";

type TxRow = {
  amount: number;
  type: string;
  status: string;
  created_at: string;
  user_id: string | null;
};

type ProfitMonitorResponse = {
  advertiser_revenue_today: number;
  advertiser_revenue_month: number;
  member_payouts_today: number;
  member_payouts_month: number;
  deferred_payouts_today: number;
  profit_today: number;
  profit_month: number;
  profit_margin_today: number;
  profit_margin_month: number;
  daily_payout_cap: number;
  daily_payout_used: number;
  daily_payout_remaining: number;
  is_at_risk: boolean;
  plan_breakdown: Array<{ plan: string; member_count: number; total_earned_today: number }>;
};

const PAYOUT_TYPES = new Set([
  "earning",
  "ad_view",
  "task_complete",
  "game_reward",
  "referral_upgrade",
  "referral",
  "referral_commission",
  "spin_wheel",
  "scratch_card",
  "mystery_box",
  "streak",
  "mission",
  "tournament_prize",
  "team_prize",
]);

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function normalizePlan(raw: string | null | undefined): "free" | "starter" | "growth" | "pro" | "elite" {
  const p = String(raw ?? "").trim().toLowerCase();
  if (p === "free") return "free";
  if (p === "starter" || p === "active") return "starter";
  if (p === "growth") return "growth";
  if (p === "pro") return "pro";
  if (p === "elite" || p === "vip") return "elite";
  return "free";
}

export async function GET(request: Request) {
  const internalKey = process.env.PROFIT_MONITOR_INTERNAL_KEY?.trim();
  const providedInternalKey = request.headers.get("x-internal-health-key")?.trim();
  const internalAllowed = !!internalKey && !!providedInternalKey && internalKey === providedInternalKey;

  if (!internalAllowed && !(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const now = new Date();
  const dayStartIso = startOfUtcDay(now).toISOString();
  const monthStartIso = startOfUtcMonth(now).toISOString();

  const { data: txRows, error: txError } = await supabase
    .from("transactions")
    .select("amount, type, status, created_at, user_id")
    .gte("created_at", monthStartIso);

  if (txError) {
    return NextResponse.json({ message: txError.message }, { status: 500 });
  }

  const tx = (txRows ?? []) as TxRow[];
  const dayStartMs = new Date(dayStartIso).getTime();
  const monthStartMs = new Date(monthStartIso).getTime();

  let advertiserRevenueToday = 0;
  let advertiserRevenueMonth = 0;
  let memberPayoutsToday = 0;
  let memberPayoutsMonth = 0;
  let deferredPayoutsToday = 0;

  const payoutsTodayByUser = new Map<string, number>();

  for (const row of tx) {
    const createdMs = new Date(row.created_at).getTime();
    if (createdMs < monthStartMs) continue;
    const isToday = createdMs >= dayStartMs;
    const amount = Number(row.amount ?? 0);

    const isAdvertiserRevenue =
      row.status === "completed" && (row.type === "deposit" || row.type === "advertiser_payment");
    if (isAdvertiserRevenue) {
      advertiserRevenueMonth += amount;
      if (isToday) advertiserRevenueToday += amount;
      continue;
    }

    const isCompletedPayout = row.status === "completed" && PAYOUT_TYPES.has(row.type);
    if (isCompletedPayout) {
      memberPayoutsMonth += amount;
      if (isToday) {
        memberPayoutsToday += amount;
        if (row.user_id) {
          payoutsTodayByUser.set(row.user_id, (payoutsTodayByUser.get(row.user_id) ?? 0) + amount);
        }
      }
      continue;
    }

    if (isToday && row.status === "deferred") {
      deferredPayoutsToday += 1;
    }
  }

  const profitToday = advertiserRevenueToday - memberPayoutsToday;
  const profitMonth = advertiserRevenueMonth - memberPayoutsMonth;

  const profitMarginToday =
    advertiserRevenueToday > 0 ? (profitToday / advertiserRevenueToday) * 100 : 0;
  const profitMarginMonth =
    advertiserRevenueMonth > 0 ? (profitMonth / advertiserRevenueMonth) * 100 : 0;

  const dailyPayoutCap = DAILY_PAYOUT_CAPS.totalMemberPayoutCents;
  const dailyPayoutUsed = memberPayoutsToday;
  const dailyPayoutRemaining = Math.max(0, dailyPayoutCap - dailyPayoutUsed);
  const isAtRisk = profitMarginToday < PROFIT_SAFETY_THRESHOLD * 100;

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, membership");
  if (usersError) {
    return NextResponse.json({ message: usersError.message }, { status: 500 });
  }

  const membersByPlan = new Map<string, number>();
  const userPlanById = new Map<string, string>();
  for (const user of users ?? []) {
    const row = user as { id?: string; membership?: string };
    if (!row.id) continue;
    const plan = normalizePlan(row.membership);
    userPlanById.set(row.id, plan);
    membersByPlan.set(plan, (membersByPlan.get(plan) ?? 0) + 1);
  }

  const earnedTodayByPlan = new Map<string, number>();
  payoutsTodayByUser.forEach((amount, userId) => {
    const plan = userPlanById.get(userId) ?? "free";
    earnedTodayByPlan.set(plan, (earnedTodayByPlan.get(plan) ?? 0) + amount);
  });

  const orderedPlans: Array<"free" | "starter" | "growth" | "pro" | "elite"> = [
    "free",
    "starter",
    "growth",
    "pro",
    "elite",
  ];
  const plan_breakdown: ProfitMonitorResponse["plan_breakdown"] = orderedPlans.map((plan) => ({
    plan,
    member_count: membersByPlan.get(plan) ?? 0,
    total_earned_today: earnedTodayByPlan.get(plan) ?? 0,
  }));

  return NextResponse.json({
    advertiser_revenue_today: advertiserRevenueToday,
    advertiser_revenue_month: advertiserRevenueMonth,
    member_payouts_today: memberPayoutsToday,
    member_payouts_month: memberPayoutsMonth,
    deferred_payouts_today: deferredPayoutsToday,
    profit_today: profitToday,
    profit_month: profitMonth,
    profit_margin_today: profitMarginToday,
    profit_margin_month: profitMarginMonth,
    daily_payout_cap: dailyPayoutCap,
    daily_payout_used: dailyPayoutUsed,
    daily_payout_remaining: dailyPayoutRemaining,
    is_at_risk: isAtRisk,
    plan_breakdown,
  });
}
