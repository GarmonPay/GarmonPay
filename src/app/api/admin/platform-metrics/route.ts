import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function sumCents(rows: { amount_cents?: number | null }[] | null): number {
  let s = 0;
  for (const r of rows ?? []) {
    s += Number(r?.amount_cents ?? 0);
  }
  return s;
}

function sumDepositCents(rows: { amount?: number | null }[] | null): number {
  let s = 0;
  for (const r of rows ?? []) {
    const n = Number(r?.amount ?? 0);
    if (n > 0) s += n;
  }
  return s;
}

/** Withdrawal lines are negative; magnitude = amount paid out to users. */
function sumWithdrawalPaidCents(rows: { amount?: number | null }[] | null): number {
  let s = 0;
  for (const r of rows ?? []) {
    const n = Number(r?.amount ?? 0);
    s += Math.abs(Math.min(0, n));
  }
  return s;
}

function sumBalances(rows: { balance?: number | null }[] | null): number {
  let s = 0;
  for (const r of rows ?? []) {
    s += Number(r?.balance ?? 0);
  }
  return s;
}

/**
 * GET /api/admin/platform-metrics
 * Platform revenue from platform_earnings; user deposits/balances from wallet tables; active = paid membership.
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
  const tomorrow = new Date(startOfUtcDay(now).getTime() + 86400000).toISOString();
  const monthStart = startOfUtcMonth(now).toISOString();

  const [
    peTodayRes,
    peMonthRes,
    depTodayRes,
    depMonthRes,
    wdTodayRes,
    balRes,
    activeMembersRes,
  ] = await Promise.all([
    supabase
      .from("platform_earnings")
      .select("amount_cents")
      .gte("created_at", todayStart)
      .lt("created_at", tomorrow),
    supabase.from("platform_earnings").select("amount_cents").gte("created_at", monthStart),
    supabase
      .from("wallet_ledger")
      .select("amount")
      .eq("type", "deposit")
      .gte("created_at", todayStart)
      .lt("created_at", tomorrow),
    supabase
      .from("wallet_ledger")
      .select("amount")
      .eq("type", "deposit")
      .gte("created_at", monthStart),
    supabase
      .from("wallet_ledger")
      .select("amount")
      .eq("type", "withdrawal")
      .gte("created_at", todayStart)
      .lt("created_at", tomorrow),
    supabase.from("wallet_balances").select("balance"),
    supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .neq("membership", "free"),
  ]);

  if (peTodayRes.error) console.error("platform-metrics platform_earnings today", peTodayRes.error);
  if (peMonthRes.error) console.error("platform-metrics platform_earnings month", peMonthRes.error);
  if (depTodayRes.error) console.error("platform-metrics wallet_ledger deposits today", depTodayRes.error);
  if (depMonthRes.error) console.error("platform-metrics wallet_ledger deposits month", depMonthRes.error);
  if (wdTodayRes.error) console.error("platform-metrics wallet_ledger withdrawals today", wdTodayRes.error);
  if (balRes.error) console.error("platform-metrics wallet_balances", balRes.error);
  if (activeMembersRes.error) console.error("platform-metrics users active count", activeMembersRes.error);

  const platformRevenueTodayCents = sumCents(peTodayRes.data as { amount_cents?: number }[] | null);
  const platformRevenueMonthCents = sumCents(peMonthRes.data as { amount_cents?: number }[] | null);
  const userDepositsTodayCents = sumDepositCents(depTodayRes.data as { amount?: number }[] | null);
  const userDepositsMonthCents = sumDepositCents(depMonthRes.data as { amount?: number }[] | null);
  const withdrawalsTodayCents = sumWithdrawalPaidCents(wdTodayRes.data as { amount?: number }[] | null);
  const totalUserBalancesCents = sumBalances(balRes.data as { balance?: number }[] | null);
  const platformProfitTodayCents = platformRevenueTodayCents - withdrawalsTodayCents;
  const activeMembersCount = activeMembersRes.count ?? 0;

  return NextResponse.json({
    platformRevenueTodayCents,
    platformRevenueMonthCents,
    userDepositsTodayCents,
    totalUserBalancesCents,
    platformProfitTodayCents,
    activeMembersCount,
    userDepositsMonthCents,
  });
}
