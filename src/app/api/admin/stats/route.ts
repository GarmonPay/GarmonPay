import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";
import { getWalletTotals } from "@/lib/wallet-ledger";

export type RecentUserDepositRow = {
  id: string;
  user_id: string;
  amount: number;
  created_at: string;
  user_email?: string;
};

/** Approved/paid payout rows on `withdrawals` (cents in `amount`). Used for net profit vs platform_earnings. */
async function sumWithdrawalsApprovedOrPaidCents(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("withdrawals")
    .select("amount")
    .in("status", ["approved", "paid"]);
  if (error) {
    console.error("Admin stats sum withdrawals (approved/paid):", error);
    return 0;
  }
  let total = 0;
  for (const r of data ?? []) {
    total += Number((r as { amount?: number }).amount ?? 0);
  }
  return total;
}

async function sumPlatformEarningsAllTime(supabase: SupabaseClient): Promise<number> {
  let total = 0;
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("platform_earnings")
      .select("amount_cents")
      .range(from, from + page - 1);
    if (error) {
      console.error("Admin stats sumPlatformEarningsAllTime:", error);
      break;
    }
    if (!data?.length) break;
    for (const r of data) {
      total += Number((r as { amount_cents?: number }).amount_cents ?? 0);
    }
    if (data.length < page) break;
    from += page;
  }
  return total;
}

/**
 * GET /api/admin/stats
 * Net profit (reported): Σ platform_earnings.amount_cents − Σ withdrawals.amount where status ∈ (approved, paid).
 * Ledger totals from getWalletTotals() are informational (user liability vs ledger).
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
        platformRevenueAllTimeCents: 0,
        approvedWithdrawalsFromRequestsCents: 0,
        recentUserDeposits: [] as RecentUserDepositRow[],
      },
      { status: 503 }
    );
  }

  const supabase = createClient(url, serviceKey);

  const { count, error: countError } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });
  const totalUsers = countError ? 0 : (count ?? 0);

  let totalDepositsCents = 0;
  let totalWithdrawalsCents = 0;
  let totalBalanceCents = 0;
  try {
    const w = await getWalletTotals();
    totalDepositsCents = w.totalDepositsCents;
    totalWithdrawalsCents = w.totalWithdrawalsCents;
    totalBalanceCents = w.totalBalanceCents;
  } catch (e) {
    console.error("Admin stats getWalletTotals error:", e);
  }

  let platformRevenueAllTimeCents = 0;
  try {
    platformRevenueAllTimeCents = await sumPlatformEarningsAllTime(supabase);
  } catch (e) {
    console.error("Admin stats platform_earnings sum:", e);
  }

  let approvedWithdrawalsFromRequestsCents = 0;
  try {
    approvedWithdrawalsFromRequestsCents = await sumWithdrawalsApprovedOrPaidCents(supabase);
  } catch (e) {
    console.error("Admin stats withdrawals table sum:", e);
  }

  const totalProfitCents = platformRevenueAllTimeCents - approvedWithdrawalsFromRequestsCents;

  let recentUserDeposits: RecentUserDepositRow[] = [];
  try {
    const { data: ledgerRows, error: ledgerErr } = await supabase
      .from("wallet_ledger")
      .select("id, user_id, amount, created_at")
      .eq("type", "deposit")
      .order("created_at", { ascending: false })
      .limit(40);
    if (ledgerErr) {
      console.error("Admin stats wallet_ledger deposits:", ledgerErr);
    } else {
      const rows = (ledgerRows ?? []) as Array<{
        id: string;
        user_id: string;
        amount: number;
        created_at: string;
      }>;
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      let emailById = new Map<string, string>();
      if (ids.length > 0) {
        const { data: userRows } = await supabase.from("users").select("id, email").in("id", ids);
        emailById = new Map(
          (userRows ?? []).map((u: { id: string; email?: string | null }) => [
            u.id,
            String(u.email ?? ""),
          ])
        );
      }
      recentUserDeposits = rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        amount: r.amount,
        created_at: r.created_at,
        user_email: emailById.get(r.user_id) || undefined,
      }));
    }
  } catch (e) {
    console.error("Admin stats recent deposits:", e);
  }

  return NextResponse.json({
    totalUsers,
    totalDeposits: totalDepositsCents,
    /** Ledger withdrawal volume (wallet_ledger type withdrawal); not the same as approved payout rows. */
    totalWithdrawals: totalWithdrawalsCents,
    totalBalance: totalBalanceCents,
    /** Σ platform_earnings − Σ withdrawals.amount (approved/paid). */
    totalProfit: totalProfitCents,
    platformRevenueAllTimeCents,
    approvedWithdrawalsFromRequestsCents,
    recentUserDeposits,
  });
}
