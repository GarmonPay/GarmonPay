import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { authenticateAdminRequest } from "@/lib/admin-auth";

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

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
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

    const { data: rows, error } = await admin
      .from("platform_revenue")
      .select("amount, created_at, fight_id")
      .eq("source", "fight")
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (error) {
      return NextResponse.json(
        { message: "Failed to fetch revenue", error: error.message },
        { status: 500 }
      );
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

    const body: AdminRevenueResponse = {
      totalFightRevenueCents,
      dailyRevenueCents,
      monthlyRevenueCents,
      fightCount: fightIds.size,
      chartData,
    };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { message: "Server error", error: String(e) },
      { status: 500 }
    );
  }
}
