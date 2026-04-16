import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  countUserReferrals,
  getUserReferralEarningsGpc,
  getReferrerRank,
  getUserBadges,
  canClaimDaily,
  ensureBadgesAwarded,
} from "@/lib/viral-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/growth — your referrals, leaderboard rank, badges, daily claim status. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({
      totalReferrals: 0,
      referralEarningsGpc: 0,
      leaderboardRank: null,
      badges: [],
      canClaimDaily: false,
    });
  }
  try {
    await ensureBadgesAwarded(userId).catch(() => {});
    const [totalReferrals, referralEarningsGpc, leaderboardRank, badges, canClaim] = await Promise.all([
      countUserReferrals(userId),
      getUserReferralEarningsGpc(userId),
      getReferrerRank(userId),
      getUserBadges(userId),
      canClaimDaily(userId),
    ]);
    return NextResponse.json({
      totalReferrals: totalReferrals ?? 0,
      referralEarningsGpc: referralEarningsGpc ?? 0,
      leaderboardRank: leaderboardRank ?? null,
      badges: badges ?? [],
      canClaimDaily: canClaim ?? false,
    });
  } catch (e) {
    console.error("Growth error:", e);
    return NextResponse.json({
      totalReferrals: 0,
      referralEarningsGpc: 0,
      leaderboardRank: null,
      badges: [],
      canClaimDaily: false,
    });
  }
}
