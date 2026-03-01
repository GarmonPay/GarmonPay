import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { getPlatformTotals, listAllTransactions } from "@/lib/transactions-db";

function normalizeAmountToCents(value: number | null | undefined): number {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw)) return 0;
  // Legacy deposits may be stored in dollars (decimal); current system stores cents.
  return Number.isInteger(raw) ? raw : Math.round(raw * 100);
}

/** GET /api/admin/stats — real data from public.users, deposits, transactions. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let supabase = createAdminClient();
  let usingAnonKey = false;
  if (!supabase && url && anonKey) {
    supabase = createClient(url, anonKey);
    usingAnonKey = true;
  }

  if (!supabase) {
    return NextResponse.json(
      {
        totalUsers: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalBalance: 0,
        totalProfit: 0,
        totalRevenue: 0,
        recentTransactions: [],
        message: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. For full stats set SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 }
    );
  }

  // 1) User count from public.users
  const { count, error: countError } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });
  if (countError) console.error("Admin stats count error:", countError);
  const totalUsers = count ?? 0;

  // 2) Total balance: sum users.balance
  const { data: balanceRows, error: balanceError } = await supabase.from("users").select("balance");
  if (balanceError) console.error("Admin stats balance error:", balanceError);
  let totalBalance = 0;
  (balanceRows ?? []).forEach((r: { balance?: number | null }) => {
    totalBalance += Number(r?.balance ?? 0);
  });

  // 3) Total deposits: sum from public.deposits (amount in dollars) + fallback to transactions (cents)
  let totalDepositsCents = 0;
  const { data: depositsRows, error: depositsError } = await supabase.from("deposits").select("amount");
  if (depositsError) console.error("Admin stats deposits error:", depositsError);
  totalDepositsCents = (depositsRows ?? []).reduce(
    (sum: number, d: { amount?: number | null }) => sum + normalizeAmountToCents(d?.amount),
    0
  );

  let totalWithdrawalsCents = 0;
  try {
    const { data: withdrawalAmountRows, error: wAmountErr } = await supabase
      .from("withdrawals")
      .select("amount")
      .in("status", ["approved", "completed", "paid"]);
    if (!wAmountErr && Array.isArray(withdrawalAmountRows)) {
      totalWithdrawalsCents = withdrawalAmountRows.reduce((sum: number, r: { amount?: number | null }) => sum + Number(r?.amount ?? 0), 0);
    }
  } catch {
    // ignore
  }
  let recentTransactions: { id: string; user_id: string; type: string; amount: number; status: string; description: string | null; created_at: string; user_email?: string }[] = [];
  if (serviceKey) {
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
  }

  // 4) Revenue
  let totalRevenueCents = 0;
  try {
    const { data: withdrawalRows, error: wErr } = await supabase.from("withdrawals").select("platform_fee").in("status", ["approved", "completed"]);
    if (wErr) console.error("Admin stats withdrawals error:", wErr);
    (withdrawalRows ?? []).forEach((r: { platform_fee?: number | null }) => {
      totalRevenueCents += Number(r?.platform_fee ?? 0);
    });
    const { data: revRows } = await supabase.from("platform_revenue").select("amount");
    (revRows ?? []).forEach((r: { amount?: number | null }) => {
      totalRevenueCents += Number(r?.amount ?? 0);
    });
  } catch (e) {
    console.error("Admin stats revenue error:", e);
  }

  let totalProfitCents = 0;
  try {
    const { data: profitRows } = await supabase.from("profit").select("amount");
    (profitRows ?? []).forEach((r: { amount?: number | null }) => {
      totalProfitCents += Number(r?.amount ?? 0);
    });
  } catch {
    // optional
  }

  return NextResponse.json({
    totalUsers,
    totalDeposits: totalDepositsCents,
    totalWithdrawals: totalWithdrawalsCents,
    totalBalance,
    totalProfit: totalProfitCents,
    totalRevenue: totalRevenueCents,
    recentTransactions,
    ...(usingAnonKey && { message: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel for full admin stats (users/deposits may be limited by RLS)." }),
  });
}
