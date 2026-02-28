import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listAds as listAdsDb } from "@/lib/ads-db";
import { adRowToApi } from "@/lib/ads-mapper";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/ads/list — list available ads. Same as GET /api/ads. Production: Supabase only. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ ads: [], message: "Service unavailable" }, { status: 503 });
  }
  try {
    const rows = await listAdsDb();
    return NextResponse.json({ ads: rows.map(adRowToApi) });
  } catch (e) {
    console.error("Ads list error:", e);
    return NextResponse.json({ ads: [], message: "Failed to load ads" }, { status: 500 });
  }
}
