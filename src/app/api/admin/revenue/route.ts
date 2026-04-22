import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export interface RevenueChartPoint {
  date: string;
  amountCents: number;
}

export interface PeriodBreakdown {
  total: number;
  breakdown: Record<string, number>;
}

export interface AdminRevenueResponse {
  totalFightRevenueCents: number;
  dailyRevenueCents: number;
  monthlyRevenueCents: number;
  fightCount: number;
  chartData: RevenueChartPoint[];
  /**
   * Legacy field: sum of `transactions` rows with type=deposit (user top-ups).
   * Prefer `userDepositsAllTimeCents` — same value; not platform revenue.
   */
  revenue: number;
  /** User funds deposited (all time); same as `revenue` here — not GarmonPay earned revenue. */
  userDepositsAllTimeCents: number;
  /** Platform fee lines (`platform_earnings`) — games, ads, etc. */
  today: {
    total: number;
    other: number;
    coinflip: number;
    ads: number;
    memberships: number;
  };
  thisWeek: PeriodBreakdown;
  thisMonth: PeriodBreakdown;
  allTime: PeriodBreakdown;
  recentTransactions: Array<{
    id: string;
    source: string;
    amount_cents: number;
    description: string | null;
    created_at: string;
  }>;
  message?: string;
}

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function startOfMonthUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCDate(1);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function buildEmptyChartData(now: Date): RevenueChartPoint[] {
  const chartData: RevenueChartPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    chartData.push({ date: d.toISOString().slice(0, 10), amountCents: 0 });
  }
  return chartData;
}

function bucketPlatformSource(source: string): "coinflip" | "ads" | "memberships" | "other" {
  const s = (source || "").toLowerCase();
  if (s === "celo_game" || s.includes("celo")) return "other";
  if (s.includes("coin") && s.includes("flip")) return "coinflip";
  if (s.includes("ad")) return "ads";
  if (s.includes("member") || s === "stripe" || s.includes("subscription")) return "memberships";
  return "other";
}

type PeRow = { id?: string; source: string; amount_cents: number; created_at: string; description?: string | null };

function aggregatePlatformEarnings(rows: PeRow[], since: Date | null) {
  const filtered = since ? rows.filter((r) => new Date(r.created_at) >= since) : rows;
  let total = 0;
  const breakdown: Record<string, number> = {
    coinflip: 0,
    ads: 0,
    memberships: 0,
    other: 0,
  };
  for (const r of filtered) {
    const n = Number(r.amount_cents) || 0;
    total += n;
    const b = bucketPlatformSource(r.source);
    if (b === "other") breakdown.other += n;
    else breakdown[b] += n;
  }
  return { total, breakdown };
}

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const todayStart = startOfDayUTC(now);
  const monthStart = startOfMonthUTC(now);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const emptyPe = (): AdminRevenueResponse["today"] => ({
    total: 0,
    other: 0,
    coinflip: 0,
    ads: 0,
    memberships: 0,
  });

  if (!admin) {
    return NextResponse.json({
      totalFightRevenueCents: 0,
      dailyRevenueCents: 0,
      monthlyRevenueCents: 0,
      fightCount: 0,
      chartData: buildEmptyChartData(now),
      revenue: 0,
      userDepositsAllTimeCents: 0,
      today: emptyPe(),
      thisWeek: { total: 0, breakdown: {} },
      thisMonth: { total: 0, breakdown: {} },
      allTime: { total: 0, breakdown: {} },
      recentTransactions: [],
      message: "Set SUPABASE_SERVICE_ROLE_KEY for revenue data.",
    });
  }

  try {
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [platformRes, depositRes, peRes] = await Promise.all([
      admin
        .from("platform_revenue")
        .select("amount, created_at, fight_id")
        .eq("source", "fight")
        .gte("created_at", thirtyDaysAgo.toISOString()),
      admin.from("transactions").select("amount").eq("type", "deposit"),
      admin
        .from("platform_earnings")
        .select("id, source, amount_cents, description, created_at")
        .order("created_at", { ascending: false })
        .limit(8000),
    ]);

    const { data: rows, error } = platformRes;
    const peRows = (peRes.data ?? []) as PeRow[];
    const peError = peRes.error;

    let depositRevenue = 0;
    (depositRes.data ?? []).forEach((t) => {
      depositRevenue += Number((t as { amount?: number }).amount ?? 0);
    });

    if (error) {
      console.error("Admin revenue fetch error:", error);
      const todayAgg = !peError ? aggregatePlatformEarnings(peRows, todayStart) : { total: 0, breakdown: {} };
      const other = todayAgg.breakdown.other ?? 0;
      return NextResponse.json({
        totalFightRevenueCents: 0,
        dailyRevenueCents: 0,
        monthlyRevenueCents: 0,
        fightCount: 0,
        chartData: buildEmptyChartData(now),
        revenue: depositRevenue,
        userDepositsAllTimeCents: depositRevenue,
        today: {
          total: todayAgg.total,
          other,
          coinflip: todayAgg.breakdown.coinflip ?? 0,
          ads: todayAgg.breakdown.ads ?? 0,
          memberships: todayAgg.breakdown.memberships ?? 0,
        },
        thisWeek: !peError
          ? (() => {
              const a = aggregatePlatformEarnings(peRows, weekStart);
              return { total: a.total, breakdown: a.breakdown };
            })()
          : { total: 0, breakdown: {} },
        thisMonth: !peError
          ? (() => {
              const a = aggregatePlatformEarnings(peRows, monthStart);
              return { total: a.total, breakdown: a.breakdown };
            })()
          : { total: 0, breakdown: {} },
        allTime: !peError
          ? (() => {
              const a = aggregatePlatformEarnings(peRows, null);
              return { total: a.total, breakdown: a.breakdown };
            })()
          : { total: 0, breakdown: {} },
        recentTransactions: !peError
          ? peRows.slice(0, 40).map((r) => ({
              id: String(r.id ?? ""),
              source: r.source,
              amount_cents: Number(r.amount_cents) || 0,
              description: r.description ?? null,
              created_at: r.created_at,
            }))
          : [],
      });
    }

    const list = (rows ?? []) as { amount: number; created_at: string; fight_id: string | null }[];
    let totalFightRevenueCents = 0;
    let dailyRevenueCents = 0;
    let monthlyRevenueCents = 0;
    const fightIds = new Set<string>();
    const byDay: Record<string, number> = {};

    for (const r of list) {
      const amt = Number(r.amount) || 0;
      const createdAt = new Date(r.created_at);
      totalFightRevenueCents += amt;
      if (createdAt >= monthStart) monthlyRevenueCents += amt;
      if (createdAt >= todayStart) dailyRevenueCents += amt;
      if (r.fight_id) fightIds.add(r.fight_id);
      const dayKey = createdAt.toISOString().slice(0, 10);
      byDay[dayKey] = (byDay[dayKey] ?? 0) + amt;
    }

    const chartData: RevenueChartPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      chartData.push({
        date: dateKey,
        amountCents: byDay[dateKey] ?? 0,
      });
    }

    const todayAgg = !peError ? aggregatePlatformEarnings(peRows, todayStart) : { total: 0, breakdown: {} };
    const weekAgg = !peError ? aggregatePlatformEarnings(peRows, weekStart) : { total: 0, breakdown: {} };
    const monthAgg = !peError ? aggregatePlatformEarnings(peRows, monthStart) : { total: 0, breakdown: {} };
    const allAgg = !peError ? aggregatePlatformEarnings(peRows, null) : { total: 0, breakdown: {} };

    const body: AdminRevenueResponse = {
      totalFightRevenueCents,
      dailyRevenueCents,
      monthlyRevenueCents,
      fightCount: fightIds.size,
      chartData,
      revenue: depositRevenue,
      userDepositsAllTimeCents: depositRevenue,
      today: {
        total: todayAgg.total,
        other: todayAgg.breakdown.other ?? 0,
        coinflip: todayAgg.breakdown.coinflip ?? 0,
        ads: todayAgg.breakdown.ads ?? 0,
        memberships: todayAgg.breakdown.memberships ?? 0,
      },
      thisWeek: { total: weekAgg.total, breakdown: weekAgg.breakdown },
      thisMonth: { total: monthAgg.total, breakdown: monthAgg.breakdown },
      allTime: { total: allAgg.total, breakdown: allAgg.breakdown },
      recentTransactions: !peError
        ? peRows.slice(0, 40).map((r) => ({
            id: String(r.id ?? ""),
            source: r.source,
            amount_cents: Number(r.amount_cents) || 0,
            description: r.description ?? null,
            created_at: r.created_at,
          }))
        : [],
    };

    if (peError) {
      console.warn("[admin/revenue] platform_earnings:", peError.message);
    }

    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { message: "Server error", error: String(e) },
      { status: 500 }
    );
  }
}
