import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  dailyCapForTier,
  getUserGpcEarnedToday,
  getUserMembershipTier,
  getWatchPayoutGpc,
  listFeedVideos,
} from "@/lib/watch-earn";

/** GET /api/earn/feed — approved videos the user can still watch for GPC. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [videos, payoutGpc, tier, earnedToday] = await Promise.all([
      listFeedVideos(userId),
      getWatchPayoutGpc(),
      getUserMembershipTier(userId),
      getUserGpcEarnedToday(userId),
    ]);
    const dailyCap = dailyCapForTier(tier);

    return NextResponse.json({
      videos: videos.map((v) => ({
        id: v.id,
        title: v.title,
        videoUrl: v.video_url,
        thumbnailUrl: v.thumbnail_url,
        viewsCount: v.views_count,
        payoutGpc,
        remainingBudgetGpc: Math.max(0, v.budget_gpc - v.spent_gpc),
      })),
      payoutGpc,
      dailyCapGpc: dailyCap,
      earnedTodayGpc: earnedToday,
      remainingTodayGpc: Math.max(0, dailyCap - earnedToday),
      membershipTier: tier,
    });
  } catch (e) {
    console.error("[earn/feed]", e);
    return NextResponse.json({ message: "Could not load feed" }, { status: 500 });
  }
}
