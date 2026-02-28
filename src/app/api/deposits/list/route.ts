import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/deposits/list — list deposits. User: own deposits. Admin (X-Admin-Id): all deposits. */
export async function GET(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  const isAdminUser = !!(adminId && (await isAdmin(request)));
  const userId = await getAuthUserId(request);

  if (!isAdminUser && !userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ deposits: [], message: "Service unavailable" }, { status: 503 });
  }

  let query = supabase.from("deposits").select("id, user_id, amount, status, stripe_session, created_at").order("created_at", { ascending: false });
  if (!isAdminUser && userId) {
    query = query.eq("user_id", userId);
  }
  const { data, error } = await query;
  if (error) {
    console.error("Deposits list error:", error);
    return NextResponse.json({ deposits: [], message: error.message }, { status: 500 });
  }
  return NextResponse.json({ deposits: data ?? [] });
}
