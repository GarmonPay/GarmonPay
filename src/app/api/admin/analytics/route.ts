import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/analytics — list analytics_events (admin only). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const limit = Math.min(500, Math.max(1, parseInt(new URL(request.url).searchParams.get("limit") ?? "100", 10) || 100));

  const { data, error } = await supabase
    .from("analytics_events")
    .select("id, user_id, event_type, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
