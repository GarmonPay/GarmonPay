import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import {
  getTotalReferralsCount,
  getTotalCommissionsPaidGpc,
  getLeaderboard,
} from "@/lib/viral-referral-db";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/admin/referrals-stats
 * Viral referral stats: total referrals, total commissions paid, top referrers leaderboard, active referrals count.
 */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const [totalReferrals, totalCommissionsPaidGpc, leaderboard] = await Promise.all([
      getTotalReferralsCount(),
      getTotalCommissionsPaidGpc(),
      getLeaderboard(20),
    ]);

    const supabase = createAdminClient();
    let activeReferrals = 0;
    if (supabase) {
      const { count } = await supabase
        .from("viral_referrals")
        .select("id", { count: "exact", head: true })
        .in("status", ["joined", "deposited", "subscribed"]);
      activeReferrals = count ?? 0;
    }

    return NextResponse.json({
      totalReferrals,
      totalCommissionsPaidGpc,
      activeReferrals,
      leaderboard,
    });
  } catch (e) {
    console.error("Admin referrals-stats error:", e);
    return NextResponse.json({
      totalReferrals: 0,
      totalCommissionsPaidGpc: 0,
      activeReferrals: 0,
      leaderboard: [],
      message: "Viral referral tables may not exist. Run migration 20250307000000.",
    });
  }
}
