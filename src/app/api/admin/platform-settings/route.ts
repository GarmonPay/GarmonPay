import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/platform-settings — return platform_settings values. */
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
    .select("id, ad_reward_percent, earn_rate_multiplier, daily_payout_cap_cents, last_health_check, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({
      ad_reward_percent: 40,
      earn_rate_multiplier: 1.0,
      daily_payout_cap_cents: 50000,
      message: "platform_settings not found; using defaults",
    });
  }
  return NextResponse.json({
    ad_reward_percent: Number((data as { ad_reward_percent?: number }).ad_reward_percent ?? 40),
    earn_rate_multiplier: Number((data as { earn_rate_multiplier?: number }).earn_rate_multiplier ?? 1),
    daily_payout_cap_cents: Number((data as { daily_payout_cap_cents?: number }).daily_payout_cap_cents ?? 50000),
    last_health_check: (data as { last_health_check?: string }).last_health_check ?? null,
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
  const { error } = await supabase
    .from("platform_settings")
    .update({ ad_reward_percent: pct, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, ad_reward_percent: pct });
}
