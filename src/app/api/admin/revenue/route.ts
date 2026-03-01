import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export interface RevenueChartPoint {
  date: string; // YYYY-MM-DD
  amountCents: number;
}

export interface AdminRevenueResponse {
  totalFightRevenueCents: number;
  dailyRevenueCents: number;
  monthlyRevenueCents: number;
  fightCount: number;
  chartData: RevenueChartPoint[];
  /** Total from transactions type=deposit (Stripe top-ups). */
  revenue: number;
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

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { message: "Admin client not available" },
      { status: 503 }
    );
  }

  try {
    const now = new Date();
    const todayStart = startOfDayUTC(now);
    const monthStart = startOfMonthUTC(now);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [platformRes, depositRes] = await Promise.all([
      admin
        .from("platform_revenue")
        .select("amount, created_at, fight_id")
        .eq("source", "fight")
        .gte("created_at", thirtyDaysAgo.toISOString()),
      admin
        .from("transactions")
        .select("amount")
        .eq("type", "deposit")
        .eq("status", "completed"),
    ]);

    const { data: rows, error } = platformRes;

    if (error) {
      console.error("Admin revenue fetch error:", error);
      const depositTotal = (depositRes.data ?? []).reduce(
        (s, t) => s + Number((t as { amount?: number }).amount ?? 0),
        0
      );
      return NextResponse.json({
        totalFightRevenueCents: 0,
        dailyRevenueCents: 0,
        monthlyRevenueCents: 0,
        fightCount: 0,
        chartData: buildEmptyChartData(now),
        revenue: depositTotal,
      });
    }

    let depositRevenue = 0;
    (depositRes.data ?? []).forEach((t) => {
      depositRevenue += Number((t as { amount?: number }).amount ?? 0);
    });

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

    const body: AdminRevenueResponse = {
      totalFightRevenueCents,
      dailyRevenueCents,
      monthlyRevenueCents,
      fightCount: fightIds.size,
      chartData,
      revenue: depositRevenue,
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { message: "Server error", error: String(e) },
      { status: 500 }
    );
  }
}
