import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";
import { getPlatformTotals, listAllTransactions } from "@/lib/transactions-db";

/**
 * GET /api/admin/stats
 * Server-side only. Uses SUPABASE_SERVICE_ROLE_KEY only (no anon fallback).
 * Admin dashboard must call this API only — no direct Supabase from client.
 */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        totalUsers: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalBalance: 0,
        totalProfit: 0,
        totalRevenue: 0,
        recentTransactions: [],
      },
      { status: 503 }
    );
  }

  const supabase = createClient(url, serviceKey);

  const { count, error: countError } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });
  const totalUsers = countError ? 0 : (count ?? 0);

  const { data: balanceRows } = await supabase.from("users").select("balance");
  let totalBalance = 0;
  (balanceRows ?? []).forEach((r: { balance?: number | null }) => {
    totalBalance += Number(r?.balance ?? 0);
  });

  const { data: depositsRows } = await supabase.from("deposits").select("amount");
  const totalDepositsDollars = (depositsRows ?? []).reduce(
    (sum: number, d: { amount?: number | null }) => sum + Number(d?.amount ?? 0),
    0
  );
  let totalDepositsCents = Math.round(totalDepositsDollars * 100);

  let totalWithdrawalsCents = 0;
  const { data: withdrawalAmountRows } = await supabase
    .from("withdrawals")
    .select("amount")
    .in("status", ["approved", "completed", "paid"]);
  (withdrawalAmountRows ?? []).forEach((r: { amount?: number | null }) => {
    totalWithdrawalsCents += Number(r?.amount ?? 0);
  });

  let recentTransactions: { id: string; user_id: string; type: string; amount: number; status: string; description: string | null; created_at: string; user_email?: string }[] = [];
  try {
    const totals = await getPlatformTotals();
    if (totalDepositsCents === 0) totalDepositsCents = totals.totalDepositsCents;
    if (totalWithdrawalsCents === 0) totalWithdrawalsCents = totals.totalWithdrawalsCents;
    const all = await listAllTransactions();
    recentTransactions = all.slice(0, 50).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      type: r.type,
      amount: r.amount,
      status: r.status,
      description: r.description ?? null,
      created_at: r.created_at,
      user_email: (r as { user_email?: string }).user_email,
    }));
  } catch (e) {
    console.error("Admin stats transactions error:", e);
  }

  let totalRevenueCents = 0;
  const { data: withdrawalRows } = await supabase.from("withdrawals").select("platform_fee").in("status", ["approved", "completed"]);
  (withdrawalRows ?? []).forEach((r: { platform_fee?: number | null }) => {
    totalRevenueCents += Number(r?.platform_fee ?? 0);
  });
  const { data: revRows } = await supabase.from("platform_revenue").select("amount");
  (revRows ?? []).forEach((r: { amount?: number | null }) => {
    totalRevenueCents += Number(r?.amount ?? 0);
  });

  let totalProfitCents = 0;
  const { data: profitRows } = await supabase.from("profit").select("amount");
  (profitRows ?? []).forEach((r: { amount?: number | null }) => {
    totalProfitCents += Number(r?.amount ?? 0);
  });

  return NextResponse.json({
    totalUsers,
    totalDeposits: totalDepositsCents,
    totalWithdrawals: totalWithdrawalsCents,
    totalBalance,
    totalProfit: totalProfitCents,
    totalRevenue: totalRevenueCents,
    recentTransactions,
  });
}
