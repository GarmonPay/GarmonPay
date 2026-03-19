import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/ads/leaderboard — top 10 earners this week (for earn page). */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const start = weekStart.toISOString();
  const { data, error } = await supabase
    .from("garmon_user_ad_earnings")
    .select("user_id, amount")
    .eq("status", "credited")
    .gte("credited_at", start);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  const byUser: Record<string, number> = {};
  (data ?? []).forEach((r: { user_id: string; amount: number }) => {
    byUser[r.user_id] = (byUser[r.user_id] ?? 0) + Number(r.amount);
  });
  const sorted = Object.entries(byUser)
    .map(([user_id, total]) => ({ user_id, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  return NextResponse.json({ leaderboard: sorted });
}
