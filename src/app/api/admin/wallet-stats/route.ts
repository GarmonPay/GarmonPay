import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getWalletTotals } from "@/lib/wallet-ledger";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/admin/wallet-stats
 * Returns wallet ledger totals: total deposits, withdrawals, platform profit (deposits - withdrawals - balance?), user balances.
 */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  try {
    const totals = await getWalletTotals();
    const { data: balances } = await supabase
      .from("wallet_balances")
      .select("user_id, balance, updated_at")
      .order("balance", { ascending: false })
      .limit(100);
    const withEmail = (balances ?? []) as { user_id: string; balance: number; updated_at: string }[];
    const userIds = Array.from(new Set(withEmail.map((r) => r.user_id)));
    const emails = new Map<string, string>();
    for (const uid of userIds) {
      const { data: u } = await supabase.from("users").select("email").eq("id", uid).maybeSingle();
      if (u?.email) emails.set(uid, u.email as string);
    }
    const userBalances = withEmail.map((r) => ({
      user_id: r.user_id,
      email: emails.get(r.user_id) ?? null,
      balance_cents: r.balance,
      updated_at: r.updated_at,
    }));

    const platformProfitCents = totals.totalDepositsCents - totals.totalWithdrawalsCents - totals.totalBalanceCents;
    return NextResponse.json({
      totalDepositsCents: totals.totalDepositsCents,
      totalWithdrawalsCents: totals.totalWithdrawalsCents,
      totalBalanceCents: totals.totalBalanceCents,
      platformProfitCents: Math.max(0, platformProfitCents),
      userCount: totals.userCount,
      userBalances,
    });
  } catch (e) {
    console.error("[admin wallet-stats]", e);
    return NextResponse.json(
      { message: "Wallet ledger may not be migrated yet." },
      { status: 500 }
    );
  }
}
