import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { getPlatformBalance } from "@/lib/platform-balance";

/** GET /api/admin/platform-balance — read-only platform balance, total revenue, total rewards. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const row = await getPlatformBalance();
    if (!row) {
      return NextResponse.json({
        balance_cents: 0,
        total_revenue_cents: 0,
        total_rewards_paid_cents: 0,
        message: "Platform balance not configured. Run migration 20250305000000_platform_profit_protection.",
      });
    }
    return NextResponse.json({
      balance_cents: row.balance_cents,
      total_revenue_cents: row.total_revenue_cents,
      total_rewards_paid_cents: row.total_rewards_paid_cents,
    });
  } catch (e) {
    console.error("[platform-balance] GET error:", e);
    return NextResponse.json({ message: "Failed to load platform balance" }, { status: 500 });
  }
}
