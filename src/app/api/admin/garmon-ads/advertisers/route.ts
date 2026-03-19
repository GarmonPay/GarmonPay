import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";

/** GET /api/admin/garmon-ads/advertisers — list all advertisers with spend. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const { data, error } = await supabase
    .from("advertisers")
    .select("id, user_id, business_name, category, is_verified, is_active, total_spent, created_at")
    .order("total_spent", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ advertisers: data ?? [] });
}

/** PATCH /api/admin/garmon-ads/advertisers — verify, unverify, or suspend. Body: { advertiserId, action: 'verify'|'unverify'|'suspend' } */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body: { advertiserId: string; action: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const { advertiserId, action } = body;
  if (!advertiserId || !action) {
    return NextResponse.json({ message: "advertiserId and action required" }, { status: 400 });
  }
  const valid = ["verify", "unverify", "suspend", "activate"];
  if (!valid.includes(action)) {
    return NextResponse.json({ message: "action must be verify, unverify, suspend, or activate" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  const updates: Record<string, unknown> = {};
  if (action === "verify") updates.is_verified = true;
  if (action === "unverify") updates.is_verified = false;
  if (action === "suspend") updates.is_active = false;
  if (action === "activate") updates.is_active = true;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true });
  }
  const { error } = await supabase.from("advertisers").update(updates).eq("id", advertiserId);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
