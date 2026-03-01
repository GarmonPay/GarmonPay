import { NextResponse } from "next/server";
import { getAdminAuthContext } from "@/lib/admin-auth";
import { getAdminDashboardData } from "@/lib/admin-dashboard-data";

/**
 * GET /api/admin/dashboard
 * Returns launch dashboard metrics:
 * total users, total deposits, total withdrawals, total balance, total profit,
 * total revenue, and recent transactions.
 */
export async function GET(request: Request) {
  if (!(await getAdminAuthContext(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  try {
    const data = await getAdminDashboardData(limit);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin dashboard data";
    console.error("Admin dashboard data error:", message);
    return NextResponse.json({ message }, { status: 503 });
  }
}
