import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listTransactionsByUser, getTotalsForUser } from "@/lib/transactions-db";
import { createAdminClient } from "@/lib/supabase";

const emptyTransactionsResponse = {
  transactions: [] as { id: string; type: string; amount: number; status: string; description: string | null; created_at: string }[],
  totalEarningsCents: 0,
  totalWithdrawnCents: 0,
  totalAdCreditConvertedCents: 0,
  totalDepositsCents: 0,
};

/** GET /api/transactions — list current user's transactions and totals. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json(emptyTransactionsResponse, { status: 200 });
  }
  try {
    const [transactions, totals] = await Promise.all([
      listTransactionsByUser(userId),
      getTotalsForUser(userId),
    ]);
    return NextResponse.json({
      transactions,
      totalEarningsCents: totals.totalEarningsCents,
      totalWithdrawnCents: totals.totalWithdrawnCents,
      totalAdCreditConvertedCents: totals.totalAdCreditConvertedCents,
      totalDepositsCents: totals.totalDepositsCents,
    });
  } catch (e) {
    console.error("Transactions list error:", e);
    return NextResponse.json(emptyTransactionsResponse, { status: 200 });
  }
}
