import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

function normalizeAmountToCents(value: number | null | undefined): number {
  const raw = Number(value ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Number.isInteger(raw) ? raw : Math.round(raw * 100);
}

/** GET /api/admin/earnings — deposits, earnings, and profit overview (admin only). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const [depositsRes, earningsRes, txRes, revenueRes, profitRes] = await Promise.all([
    supabase
      .from("deposits")
      .select("id, user_id, amount, status, stripe_session, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("earnings")
      .select("id, user_id, amount, source, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("transactions")
      .select("id, type, amount, status, created_at")
      .in("type", ["deposit", "withdrawal"])
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("platform_revenue").select("amount"),
    supabase.from("profit").select("amount"),
  ]);

  if (depositsRes.error || earningsRes.error || txRes.error) {
    return NextResponse.json(
      {
        message:
          depositsRes.error?.message ||
          earningsRes.error?.message ||
          txRes.error?.message ||
          "Failed to load earnings data",
      },
      { status: 500 }
    );
  }

  const depositRows = (depositsRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    amount: number;
    status?: string | null;
    stripe_session?: string | null;
    created_at: string;
  }>;
  const earningRows = (earningsRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    amount: number;
    source: string | null;
    created_at: string;
  }>;
  const txRows = (txRes.data ?? []) as Array<{
    type: string;
    amount: number;
    status: string;
  }>;

  const totalDepositsCents = txRows
    .filter((t) => t.type === "deposit" && (t.status ?? "completed") === "completed")
    .reduce((sum, row) => sum + normalizeAmountToCents(row.amount), 0);
  const totalWithdrawalsCents = txRows
    .filter((t) => t.type === "withdrawal" && ["completed", "paid"].includes(t.status ?? ""))
    .reduce((sum, row) => sum + normalizeAmountToCents(row.amount), 0);
  const totalEarningsCents = earningRows.reduce(
    (sum, row) => sum + normalizeAmountToCents(row.amount),
    0
  );
  const totalPlatformRevenueCents = (revenueRes.data ?? []).reduce(
    (sum, row) => sum + normalizeAmountToCents((row as { amount?: number }).amount),
    0
  );
  const totalProfitTableCents = (profitRes.data ?? []).reduce(
    (sum, row) => sum + normalizeAmountToCents((row as { amount?: number }).amount),
    0
  );

  // Conservative profit estimate based on cash flow + explicit revenue/profit tables.
  const platformProfitCents =
    totalProfitTableCents || totalPlatformRevenueCents || totalDepositsCents - totalWithdrawalsCents;

  return NextResponse.json({
    summary: {
      totalDepositsCents,
      totalWithdrawalsCents,
      totalEarningsCents,
      totalPlatformRevenueCents,
      totalProfitCents: platformProfitCents,
    },
    deposits: depositRows.map((row) => ({
      ...row,
      amount: normalizeAmountToCents(row.amount),
      status: row.status ?? "completed",
    })),
    earnings: earningRows.map((row) => ({
      ...row,
      amount: normalizeAmountToCents(row.amount),
      source: row.source ?? "unknown",
    })),
  });
}
