import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listAds as listAdsDb } from "@/lib/ads-db";
import { adRowToApi } from "@/lib/ads-mapper";
import { listAds as listAdsMemory } from "@/lib/ads-store";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/ads — list all available ads. Auth required. Uses Supabase when configured. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (createAdminClient()) {
    try {
      const rows = await listAdsDb();
      const ads = rows.map(adRowToApi);
      return NextResponse.json({ ads });
    } catch (e) {
      console.error("Ads list error:", e);
    }
  }
  const ads = listAdsMemory().map((a) => ({
    id: a.id,
    title: a.title,
    adType: a.adType,
    rewardCents: a.rewardCents,
    requiredSeconds: a.requiredSeconds,
    videoUrl: a.videoUrl,
    imageUrl: a.imageUrl,
    textContent: a.textContent,
    targetUrl: a.targetUrl,
    active: a.active,
    createdAt: a.createdAt,
  }));
  return NextResponse.json({ ads });
}
