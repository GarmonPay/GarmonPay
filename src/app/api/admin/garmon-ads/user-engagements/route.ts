import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

/** GET /api/admin/garmon-ads/user-engagements?userId= — list engagements for a user (investigation). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ message: "userId required" }, { status: 400 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10) || 50);
  const { data, error } = await supabase
    .from("garmon_ad_engagements")
    .select("id, ad_id, engagement_type, duration_seconds, user_earned, created_at, ip_address")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ engagements: data ?? [] });
}
