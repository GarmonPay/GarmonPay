import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listTransactionsByUser, getTotalsForUser } from "@/lib/transactions-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/transactions — list current user's transactions and totals. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
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
    });
  } catch (e) {
    console.error("Transactions list error:", e);
    return NextResponse.json({ message: "Failed to load transactions" }, { status: 500 });
  }
}
