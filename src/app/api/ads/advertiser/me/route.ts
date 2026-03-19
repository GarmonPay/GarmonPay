import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getAdvertiserByUserId } from "@/lib/garmon-ads-db";

/** GET /api/ads/advertiser/me — current user's advertiser profile if any. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const advertiser = await getAdvertiserByUserId(userId);
    if (!advertiser) {
      return NextResponse.json({ advertiserId: null, advertiser: null });
    }
    return NextResponse.json({
      advertiserId: advertiser.id,
      advertiser: {
        id: advertiser.id,
        business_name: advertiser.business_name,
        category: advertiser.category,
        website: advertiser.website,
        description: advertiser.description,
        logo_url: advertiser.logo_url,
        is_verified: advertiser.is_verified,
      },
    });
  } catch (e) {
    console.error("Advertiser me error:", e);
    return NextResponse.json({ advertiserId: null, advertiser: null }, { status: 500 });
  }
}
