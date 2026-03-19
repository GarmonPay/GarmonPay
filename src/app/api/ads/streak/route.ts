import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/ads/streak — current user's ad streak. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("garmon_ad_streak")
    .select("last_activity_date, streak_days")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const row = data as { last_activity_date?: string; streak_days?: number } | null;
  const last = row?.last_activity_date?.slice(0, 10);
  const streakDays = last === today ? (row?.streak_days ?? 0) : 0;
  return NextResponse.json({ streakDays, lastActivityDate: row?.last_activity_date ?? null });
}
