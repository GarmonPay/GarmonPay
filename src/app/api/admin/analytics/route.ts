import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/analytics — list analytics events for admin dashboard. */
export async function GET(request: Request) {
  const adminUserId = await getAdminUserId(request);
  if (!adminUserId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 100)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  const eventType = searchParams.get("eventType");

  let query = supabase
    .from("analytics_events")
    .select("id,user_id,event_type,source,payload,created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (eventType) query = query.eq("event_type", eventType);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    id: string;
    user_id?: string | null;
    event_type: string;
    source: string;
    payload?: Record<string, unknown> | null;
    created_at: string;
  }>;

  const userIds = Array.from(
    new Set(rows.map((row) => row.user_id).filter((value): value is string => !!value))
  );
  const emailMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id,email").in("id", userIds);
    for (const user of users ?? []) {
      const entry = user as { id: string; email?: string | null };
      emailMap.set(entry.id, entry.email ?? "");
    }
  }

  const events = rows.map((row) => ({
    id: row.id,
    userId: row.user_id ?? "",
    userEmail: row.user_id ? (emailMap.get(row.user_id) ?? "") : "",
    eventType: row.event_type,
    source: row.source,
    payload: row.payload ?? {},
    createdAt: row.created_at,
  }));

  return NextResponse.json({ events });
}
