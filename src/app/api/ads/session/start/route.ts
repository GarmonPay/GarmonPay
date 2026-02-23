import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { startAdSession as startSessionDb, getAdById as getAdByIdDb } from "@/lib/ads-db";
import { getAdById as getAdByIdMemory, startAdSession as startSessionMemory } from "@/lib/ads-store";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/ads/session/start — start an ad session. Body: { adId }. Reward is NOT issued here. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: { adId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const { adId } = body;
  if (!adId || typeof adId !== "string") {
    return NextResponse.json({ message: "adId required" }, { status: 400 });
  }

  if (createAdminClient()) {
    try {
      const ad = await getAdByIdDb(adId);
      if (!ad) {
        return NextResponse.json({ message: "Ad not found" }, { status: 404 });
      }
      const session = await startSessionDb(userId, adId);
      if (!session) {
        return NextResponse.json(
          { message: "Could not start session (ad inactive or cooldown)" },
          { status: 400 }
        );
      }
      const expiresAt = new Date(
        new Date(session.start_time).getTime() + ad.duration_seconds * 1000
      ).toISOString();
      return NextResponse.json({
        sessionId: session.id,
        adId: session.ad_id,
        requiredSeconds: ad.duration_seconds,
        expiresAt,
      });
    } catch (e) {
      console.error("Session start error:", e);
    }
  }

  const ad = getAdByIdMemory(adId);
  if (!ad) {
    return NextResponse.json({ message: "Ad not found" }, { status: 404 });
  }
  const session = startSessionMemory(userId, adId);
  if (!session) {
    return NextResponse.json({ message: "Could not start session" }, { status: 400 });
  }
  return NextResponse.json({
    sessionId: session.id,
    adId: session.adId,
    requiredSeconds: ad.requiredSeconds,
    expiresAt: session.expiresAt,
  });
}
