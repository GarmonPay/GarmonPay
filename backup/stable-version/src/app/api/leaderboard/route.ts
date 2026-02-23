import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getTopReferrers, getTopEarners } from "@/lib/viral-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/leaderboard — top referrers and top earners. Auth required. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  try {
    const [topReferrers, topEarners] = await Promise.all([
      getTopReferrers(20),
      getTopEarners(20),
    ]);
    return NextResponse.json({ topReferrers: topReferrers ?? [], topEarners: topEarners ?? [] });
  } catch (e) {
    console.error("Leaderboard error:", e);
    return NextResponse.json({ topReferrers: [], topEarners: [] });
  }
}
