import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { getAdminUserIdFromRequest } from "@/lib/escape-room-api-auth";
import {
  getEscapeRoomSettings,
  updateEscapeRoomSettings,
} from "@/lib/escape-room-db";

export async function GET(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const settings = await getEscapeRoomSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load settings";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body:
    | Partial<{
        free_play_enabled: boolean;
        stake_mode_enabled: boolean;
        min_stake_cents: number;
        max_stake_cents: number;
        platform_fee_percent: number;
        top1_split_percent: number;
        top2_split_percent: number;
        top3_split_percent: number;
        countdown_seconds: number;
        daily_puzzle_rotation_enabled: boolean;
        maintenance_banner: string | null;
        suspicious_min_escape_seconds: number;
        large_payout_alert_cents: number;
        email_alert_large_payout: boolean;
        email_alert_suspicious: boolean;
        email_alert_wallet_errors: boolean;
      }>
    | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  try {
    const adminId = await getAdminUserIdFromRequest(req);
    if (!adminId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const settings = await updateEscapeRoomSettings(body ?? {}, adminId);
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update settings";
    return NextResponse.json({ message }, { status: 500 });
  }
}
