import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";

const EARNING_TYPES = [
  "earning",
  "referral",
  "referral_upgrade",
  "referral_commission",
  "spin_wheel",
  "scratch_card",
  "mystery_box",
  "streak",
  "mission",
  "tournament_prize",
  "team_prize",
];

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * GET /api/admin/platform-metrics
 * Platform revenue, payouts, profit (UTC day/month), members by DB membership.
 */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ message: "Server misconfigured" }, { status: 503 });
  }

  const supabase = createClient(url, serviceKey);
  const now = new Date();
  const todayStart = startOfUtcDay(now).toISOString();
  const monthStart = startOfUtcMonth(now).toISOString();
  const tomorrow = new Date(startOfUtcDay(now).getTime() + 86400000).toISOString();

  const { data: txRows, error: txErr } = await supabase
    .from("transactions")
    .select("amount, type, status, created_at")
    .gte("created_at", monthStart);

  if (txErr) {
    console.error("platform-metrics transactions", txErr);
  }

  const rows = (txRows ?? []) as {
    amount: number;
    type: string;
    status: string;
    created_at: string;
  }[];

  function sumInRange(
    predicate: (r: (typeof rows)[0]) => boolean,
    startIso: string,
    endIso: string | null
  ): number {
    let s = 0;
    const startT = new Date(startIso).getTime();
    const endT = endIso ? new Date(endIso).getTime() : Infinity;
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (t < startT || t >= endT) continue;
      if (!predicate(r)) continue;
      s += Number(r.amount);
    }
    return s;
  }

  const isDeposit = (r: (typeof rows)[0]) =>
    r.type === "deposit" && r.status === "completed";
  const isMemberPayout = (r: (typeof rows)[0]) =>
    r.type === "withdrawal" && r.status === "completed";
  const isEarningCredit = (r: (typeof rows)[0]) =>
    EARNING_TYPES.includes(r.type) && r.status === "completed";

  const platformRevenueTodayCents = sumInRange(isDeposit, todayStart, tomorrow);
  const platformRevenueMonthCents = sumInRange(isDeposit, monthStart, null);

  const paidOutWithdrawalsTodayCents = sumInRange(
    isMemberPayout,
    todayStart,
    tomorrow
  );
  const paidOutWithdrawalsMonthCents = sumInRange(isMemberPayout, monthStart, null);

  const earningsCreditedTodayCents = sumInRange(isEarningCredit, todayStart, tomorrow);
  const earningsCreditedMonthCents = sumInRange(isEarningCredit, monthStart, null);

  const profitTodayCents = platformRevenueTodayCents - paidOutWithdrawalsTodayCents;
  const profitMonthCents = platformRevenueMonthCents - paidOutWithdrawalsMonthCents;

  const { data: userRows, error: userErr } = await supabase
    .from("users")
    .select("membership");

  if (userErr) {
    console.error("platform-metrics users", userErr);
  }

  const byMembership: Record<string, number> = {};
  for (const u of userRows ?? []) {
    const m = String((u as { membership?: string }).membership ?? "starter").toLowerCase();
    byMembership[m] = (byMembership[m] ?? 0) + 1;
  }

  return NextResponse.json({
    platformRevenueTodayCents,
    platformRevenueMonthCents,
    paidOutWithdrawalsTodayCents,
    paidOutWithdrawalsMonthCents,
    earningsCreditedTodayCents,
    earningsCreditedMonthCents,
    profitTodayCents,
    profitMonthCents,
    membershipCounts: byMembership,
    totalUsers: (userRows ?? []).length,
  });
}
