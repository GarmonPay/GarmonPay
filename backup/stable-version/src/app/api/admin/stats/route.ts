import { NextResponse } from "next/server";
import { findUserById, hasAdminAccess } from "@/lib/auth-store";
import { getAdminStats } from "@/lib/admin-stats";
import { getPlatformTotals } from "@/lib/transactions-db";
import { listAllAds } from "@/lib/ads-db";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const user = findUserById(adminId);
  if (!user || !hasAdminAccess(user)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const stats = getAdminStats();
  if (createAdminClient()) {
    try {
      const [platformTotals, ads] = await Promise.all([
        getPlatformTotals(),
        listAllAds(),
      ]);
      return NextResponse.json({
        ...stats,
        totalAds: ads.length,
        totalEarningsCents: platformTotals.totalEarningsCents,
        platformTotalEarningsCents: platformTotals.totalEarningsCents,
        platformTotalWithdrawalsCents: platformTotals.totalWithdrawalsCents,
        platformTotalAdCreditCents: platformTotals.totalAdCreditCents,
      });
    } catch (_) {
      // Supabase not configured or tables missing
    }
  }
  return NextResponse.json(stats);
}
