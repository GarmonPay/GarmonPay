import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

/** POST /api/admin/garmon-ads/fraud-flags/ban — ban user from ad earnings. Body: { userId, reason? } */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  let body: { userId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  if (!body.userId) return NextResponse.json({ message: "userId required" }, { status: 400 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const { error } = await supabase.from("garmon_ad_banned_users").upsert(
    { user_id: body.userId, reason: body.reason ?? "Banned by admin" },
    { onConflict: "user_id" }
  );
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
