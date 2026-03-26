import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET timer logs for a session ?session_id= */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("escape_room_timer_logs")
    .select("*")
    .eq("session_id", sessionId)
    .order("server_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ logs: data ?? [] });
}
