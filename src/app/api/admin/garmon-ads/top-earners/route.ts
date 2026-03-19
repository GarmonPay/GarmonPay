import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

/** GET /api/admin/garmon-ads/top-earners — top users by ad earnings (this week). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const start = weekStart.toISOString();
  const { data, error } = await supabase
    .from("garmon_user_ad_earnings")
    .select("user_id, amount")
    .eq("status", "credited")
    .gte("credited_at", start);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  const byUser: Record<string, number> = {};
  (data ?? []).forEach((r: { user_id: string; amount: number }) => {
    byUser[r.user_id] = (byUser[r.user_id] ?? 0) + Number(r.amount);
  });
  const sorted = Object.entries(byUser)
    .map(([user_id, total]) => ({ user_id, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);
  return NextResponse.json({ topEarners: sorted });
}
