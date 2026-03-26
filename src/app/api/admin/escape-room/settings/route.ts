import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("escape_room_settings")
    .select("*")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const allowed = [
    "free_play_enabled",
    "stake_mode_enabled",
    "min_stake_cents",
    "max_stake_cents",
    "platform_fee_percent",
    "top1_split_percent",
    "top2_split_percent",
    "top3_split_percent",
    "countdown_seconds",
    "daily_puzzle_rotation_enabled",
    "maintenance_banner",
    "suspicious_min_escape_seconds",
    "large_payout_alert_cents",
    "email_alert_large_payout",
    "email_alert_suspicious",
    "email_alert_wallet_errors",
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  const { data: first } = await supabase.from("escape_room_settings").select("id").limit(1).maybeSingle();
  const id = (first as { id?: number } | null)?.id;
  if (id == null) {
    return NextResponse.json({ error: "No settings row" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("escape_room_settings")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}
