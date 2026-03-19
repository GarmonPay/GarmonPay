import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/notifications — list current user's notifications (newest first). */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const { data, error } = await supabase
    .from("garmon_notifications")
    .select("id, type, title, body, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ notifications: data ?? [] });
}

/** PATCH /api/notifications — mark as read. Body: { id?: string, markAll?: boolean } */
export async function PATCH(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: { id?: string; markAll?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const now = new Date().toISOString();
  if (body.markAll) {
    await supabase
      .from("garmon_notifications")
      .update({ read_at: now })
      .eq("user_id", userId)
      .is("read_at", null);
  } else if (body.id) {
    await supabase
      .from("garmon_notifications")
      .update({ read_at: now })
      .eq("id", body.id)
      .eq("user_id", userId);
  }
  return NextResponse.json({ success: true });
}
