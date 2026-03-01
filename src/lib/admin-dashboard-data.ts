import { createAdminClient } from "@/lib/supabase";

export interface AdminDashboardTransaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  created_at: string;
  user_email?: string;
}

export interface AdminDashboardData {
  totalUsers: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalBalance: number;
  totalProfit: number;
  totalRevenue: number;
  transactions: AdminDashboardTransaction[];
  recentTransactions: AdminDashboardTransaction[];
}

function sumAmountRows(rows: Array<{ amount?: number | null }> | null | undefined): number {
  return (rows ?? []).reduce((sum, row) => sum + Number(row?.amount ?? 0), 0);
}

export async function getAdminDashboardData(limit = 50): Promise<AdminDashboardData> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase service role key is not configured");
  }

  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));

  const [
    usersCountRes,
    usersBalanceRes,
    depositsTxRes,
    depositsTableRes,
    withdrawalsRes,
    revenueRes,
    profitRes,
    transactionsRes,
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("users").select("balance"),
    supabase.from("transactions").select("amount").eq("type", "deposit").eq("status", "completed"),
    supabase.from("deposits").select("amount, amount_cents, status"),
    supabase.from("withdrawals").select("amount").in("status", ["approved", "paid", "completed"]),
    supabase.from("platform_revenue").select("amount"),
    supabase.from("profit").select("amount"),
    supabase
      .from("transactions")
      .select("id, user_id, type, amount, status, description, created_at")
      .order("created_at", { ascending: false })
      .limit(safeLimit),
  ]);

  const totalUsers = usersCountRes.error ? 0 : (usersCountRes.count ?? 0);
  const totalBalance = usersBalanceRes.error
    ? 0
    : (usersBalanceRes.data ?? []).reduce(
        (sum, row: { balance?: number | null }) => sum + Number(row?.balance ?? 0),
        0
      );
  const totalDepositsFromTransactions = depositsTxRes.error
    ? 0
    : sumAmountRows(depositsTxRes.data as Array<{ amount?: number | null }>);
  const totalDepositsFromDepositsTable = depositsTableRes.error
    ? 0
    : (depositsTableRes.data ?? []).reduce((sum, row: { amount?: number | null; amount_cents?: number | null; status?: string | null }) => {
        const status = (row.status ?? "completed").toLowerCase();
        if (status && !["completed", "succeeded", "paid"].includes(status)) return sum;
        if (row.amount_cents != null) return sum + Number(row.amount_cents ?? 0);
        return sum + Math.round(Number(row.amount ?? 0) * 100);
      }, 0);
  const totalDeposits = totalDepositsFromTransactions > 0
    ? totalDepositsFromTransactions
    : totalDepositsFromDepositsTable;
  const totalWithdrawals = withdrawalsRes.error ? 0 : sumAmountRows(withdrawalsRes.data as Array<{ amount?: number | null }>);
  const totalRevenue = revenueRes.error ? 0 : sumAmountRows(revenueRes.data as Array<{ amount?: number | null }>);
  const profitFromTable = profitRes.error ? 0 : sumAmountRows(profitRes.data as Array<{ amount?: number | null }>);
  const totalProfit = profitFromTable > 0 ? profitFromTable : totalRevenue;

  const transactionsRaw = transactionsRes.error
    ? []
    : ((transactionsRes.data ?? []) as AdminDashboardTransaction[]);

  const userIds = Array.from(new Set(transactionsRaw.map((t) => t.user_id).filter(Boolean)));
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: usersRows, error: usersRowsError } = await supabase
      .from("users")
      .select("id, email")
      .in("id", userIds);
    if (!usersRowsError) {
      (usersRows ?? []).forEach((u: { id: string; email?: string | null }) => {
        if (u?.id) emailMap.set(u.id, u.email ?? "");
      });
    }
  }

  const transactions = transactionsRaw.map((tx) => ({
    ...tx,
    amount: Number(tx.amount ?? 0),
    user_email: emailMap.get(tx.user_id) ?? undefined,
  }));

  return {
    totalUsers,
    totalDeposits,
    totalWithdrawals,
    totalBalance,
    totalProfit,
    totalRevenue,
    transactions,
    recentTransactions: transactions,
  };
}
