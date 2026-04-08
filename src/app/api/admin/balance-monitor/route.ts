import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export type BalanceMonitorDriftRow = {
  email: string;
  wallet_balances_cents: number;
  ledger_latest_cents: number | null;
  drift_cents: number;
};

/**
 * GET /api/admin/balance-monitor
 * Admin-only. Compares wallet_balances to latest wallet_ledger.balance_after per user.
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
    const { count: totalUsers, error: countError } = await supabase
      .from("wallet_balances")
      .select("*", { count: "exact", head: true });

    if (countError) {
      console.error("[admin balance-monitor] count:", countError.message);
      return NextResponse.json({ message: countError.message }, { status: 500 });
    }

    const { data: driftData, error: driftError } = await supabase.rpc("admin_balance_monitor_drift");

    if (driftError) {
      console.error("[admin balance-monitor] drift rpc:", driftError.message);
      return NextResponse.json({ message: driftError.message }, { status: 500 });
    }

    const raw = (driftData ?? []) as Array<{
      email: string | null;
      wallet_balances_cents: number | string | null;
      ledger_latest_cents: number | string | null;
      drift_cents: number | string | null;
    }>;

    const driftRows: BalanceMonitorDriftRow[] = raw.map((r) => ({
      email: (r.email ?? "").trim() || "(unknown)",
      wallet_balances_cents: Math.round(Number(r.wallet_balances_cents) || 0),
      ledger_latest_cents:
        r.ledger_latest_cents == null ? null : Math.round(Number(r.ledger_latest_cents)),
      drift_cents: Math.round(Number(r.drift_cents) || 0),
    }));

    const n = totalUsers ?? 0;
    const cleanUsers = Math.max(0, n - driftRows.length);

    return NextResponse.json({
      driftRows,
      totalUsers: n,
      cleanUsers,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[admin balance-monitor]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
