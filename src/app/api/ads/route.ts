import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listAds as listAdsDb } from "@/lib/ads-db";
import { adRowToApi } from "@/lib/ads-mapper";

/** GET /api/ads — list all available active ads. Auth required. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listAdsDb();
    const ads = rows.map(adRowToApi);
    return NextResponse.json({ ads });
  } catch (e) {
    console.error("Ads list error:", e);
    return NextResponse.json({ message: "Failed to list ads" }, { status: 500 });
  }
}
