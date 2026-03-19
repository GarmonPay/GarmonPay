import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getGarmonAdById } from "@/lib/garmon-ads-db";

type StartBody = {
  adId: string;
  engagementType: "view" | "click" | "follow" | "share" | "banner_view";
};

/** POST /api/ads/engage/start — create server timestamp for engagement duration validation. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: StartBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const { adId, engagementType } = body;
  if (!adId || !engagementType) {
    return NextResponse.json({ message: "adId and engagementType required" }, { status: 400 });
  }

  const ad = await getGarmonAdById(adId);
  if (!ad || ad.status !== "active" || !ad.is_active) {
    return NextResponse.json({ message: "Ad is not active" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const now = new Date();
  const expires = new Date(now.getTime() + 15 * 60 * 1000);
  const { data, error } = await supabase
    .from("garmon_engagement_sessions")
    .insert({
      user_id: userId,
      ad_id: adId,
      engagement_type: engagementType,
      started_at: now.toISOString(),
      expires_at: expires.toISOString(),
    })
    .select("id, started_at, expires_at")
    .single();
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({
    sessionId: (data as { id: string }).id,
    startedAt: (data as { started_at: string }).started_at,
    expiresAt: (data as { expires_at: string }).expires_at,
  });
}
