import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET — current user's username change history (last 20). */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("username_history")
    .select("id, old_username, new_username, changed_at, reason, changed_by")
    .eq("user_id", userId)
    .order("changed_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[username-history GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
