import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getAdvertiserByUserId, createAdvertiser } from "@/lib/garmon-ads-db";

/** POST /api/ads/advertiser/create — create advertiser profile for logged-in user. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { business_name: string; category?: string; website?: string; description?: string; logo_url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { business_name, category, website, description, logo_url } = body;
  if (!business_name || typeof business_name !== "string" || !business_name.trim()) {
    return NextResponse.json({ message: "business_name is required" }, { status: 400 });
  }

  try {
    const existing = await getAdvertiserByUserId(userId);
    if (existing) {
      return NextResponse.json(
        { message: "Advertiser profile already exists", advertiserId: existing.id },
        { status: 200 }
      );
    }
    const advertiser = await createAdvertiser({
      user_id: userId,
      business_name: business_name.trim(),
      category: category?.trim() || null,
      website: website?.trim() || null,
      description: description?.trim() || null,
      logo_url: logo_url?.trim() || null,
    });
    return NextResponse.json({ advertiserId: advertiser.id, advertiser });
  } catch (e) {
    console.error("Advertiser create error:", e);
    return NextResponse.json({ message: "Failed to create advertiser" }, { status: 500 });
  }
}
