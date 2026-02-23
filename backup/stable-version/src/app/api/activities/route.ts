import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getRecentActivities } from "@/lib/viral-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/activities — recent platform activity feed. Auth required. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  try {
    const activities = await getRecentActivities(30);
    return NextResponse.json({ activities: activities ?? [] });
  } catch (e) {
    console.error("Activities error:", e);
    return NextResponse.json({ activities: [] });
  }
}
