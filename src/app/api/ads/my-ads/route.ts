import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getGarmonAdsByUserId } from "@/lib/garmon-ads-db";

/** GET /api/ads/my-ads — advertiser's own ads with stats. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const ads = await getGarmonAdsByUserId(userId);
    return NextResponse.json({
      ads: ads.map((ad) => ({
        id: ad.id,
        title: ad.title,
        description: ad.description,
        adType: ad.ad_type,
        mediaUrl: ad.media_url,
        thumbnailUrl: ad.thumbnail_url,
        destinationUrl: ad.destination_url,
        status: ad.status,
        isActive: ad.is_active,
        totalBudget: Number(ad.total_budget),
        remainingBudget: Number(ad.remaining_budget),
        spent: Number(ad.total_budget) - Number(ad.remaining_budget),
        views: ad.views,
        clicks: ad.clicks,
        follows: ad.follows,
        shares: ad.shares,
        totalPaidToUsers: Number(ad.total_paid_to_users),
        totalAdminCut: Number(ad.total_admin_cut),
        createdAt: ad.created_at,
      })),
    });
  } catch (e) {
    console.error("My ads error:", e);
    return NextResponse.json({ message: "Failed to load ads", ads: [] }, { status: 500 });
  }
}
