import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { platformSettingsRowId } from "@/lib/platform-settings-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/platform-settings — return platform_settings (ad_reward_percent). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("platform_settings")
    .select("id, ad_reward_percent, updated_at")
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({
      ad_reward_percent: 40,
      message: "platform_settings not found; using default 40%",
    });
  }
  return NextResponse.json({
    ad_reward_percent: Number((data as { ad_reward_percent?: number }).ad_reward_percent ?? 40),
    updated_at: (data as { updated_at?: string }).updated_at,
  });
}

/** PATCH /api/admin/platform-settings — update ad_reward_percent. Body: { ad_reward_percent: number } */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: { ad_reward_percent?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const pct = body.ad_reward_percent;
  if (typeof pct !== "number" || pct < 0 || pct > 100) {
    return NextResponse.json({ message: "ad_reward_percent must be 0–100" }, { status: 400 });
  }
  const rowId = await platformSettingsRowId(supabase);
  if (rowId === null) {
    return NextResponse.json({ message: "platform_settings row not found" }, { status: 500 });
  }
  const { error } = await supabase
    .from("platform_settings")
    .update({ ad_reward_percent: pct, updated_at: new Date().toISOString() })
    .eq("id", rowId);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, ad_reward_percent: pct });
}
