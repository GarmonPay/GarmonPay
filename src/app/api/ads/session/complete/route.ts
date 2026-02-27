import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { completeAdSessionAndIssueReward as completeDb } from "@/lib/ads-db";
import { recordActivity } from "@/lib/viral-db";
import { completeMission } from "@/lib/gamification-db";

/**
 * POST /api/ads/session/complete — BACKEND ONLY reward issuance.
 * Body: { sessionId }. Verifies session, timer elapsed, then updates balance + earnings in DB.
 */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: { sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const { sessionId } = body;
  if (!sessionId || typeof sessionId !== "string") {
    return NextResponse.json({ message: "sessionId required" }, { status: 400 });
  }

  try {
    const result = await completeDb(userId, sessionId);
    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    recordActivity(userId, "earned", "Earned from ad", result.rewardCents).catch(() => {});
    completeMission(userId, "watch_ad").catch(() => {});
    return NextResponse.json({
      success: true,
      rewardCents: result.rewardCents,
      message: "Reward issued",
    });
  } catch (e) {
    console.error("Complete session error:", e);
    return NextResponse.json({ message: "Could not complete ad. Try again." }, { status: 503 });
  }
}
