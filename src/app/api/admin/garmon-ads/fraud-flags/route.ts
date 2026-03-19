import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

/** GET /api/admin/garmon-ads/fraud-flags — list fraud-flagged users. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const { data, error } = await supabase
    .from("garmon_ad_fraud_flags")
    .select("id, user_id, ad_id, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ flags: data ?? [] });
}
