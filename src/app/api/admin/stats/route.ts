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
  const admin = createAdminClient();
  if (admin) {
    try {
      const [platformTotals, ads, clicksRes, revenueRes] = await Promise.all([
        getPlatformTotals(),
        listAllAds(),
        admin.from("ad_clicks").select("id, ad_id, user_id, created_at").order("created_at", { ascending: false }).limit(20),
        admin.from("revenue_transactions").select("amount, type"),
      ]);
      const recentAdClicks = (clicksRes.data ?? []).map((c: { id: string; ad_id: string; user_id: string; created_at: string }) => ({
        id: c.id,
        userId: c.user_id,
        adId: c.ad_id,
        clickedAt: c.created_at,
      }));
      let totalDepositsCents = 0;
      for (const r of revenueRes.data ?? []) {
        const row = r as { amount?: number; type?: string };
        if (row.type === "payment" && typeof row.amount === "number") {
          totalDepositsCents += Math.round(row.amount * 100);
        }
      }
      return NextResponse.json({
        ...stats,
        totalAds: ads.length,
        totalEarningsCents: platformTotals.totalEarningsCents,
        platformTotalEarningsCents: platformTotals.totalEarningsCents,
        platformTotalWithdrawalsCents: platformTotals.totalWithdrawalsCents,
        platformTotalAdCreditCents: platformTotals.totalAdCreditCents,
        totalDepositsCents,
        recentAdClicks,
      });
    } catch (_) {
      // ad_clicks or other tables may not exist yet
    }
  }
  return NextResponse.json(stats);
}
