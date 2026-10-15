import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
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
    // Display names only. Optional presentation enrichment cannot block reward rules.
    const creatorNames = new Map<string, string>();
    try {
      const admin = createAdminClient();
      const ids = Array.from(new Set(videos.map(video => video.creator_id)));
      if (admin && ids.length) {
        const { data } = await admin.from("users").select("id,full_name,username").in("id", ids);
        for (const creator of data ?? []) {
          const name = creator.username?.trim() || creator.full_name?.trim();
          if (name) creatorNames.set(creator.id, name);
        }
      }
    } catch { /* A missing display name does not affect feed eligibility or payouts. */ }


    return NextResponse.json({
      videos: videos.map((v) => ({
        id: v.id,
        title: v.title,
        creatorName: creatorNames.get(v.creator_id) ?? null,
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
