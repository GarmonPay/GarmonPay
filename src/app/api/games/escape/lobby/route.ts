import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getEscapeSettings, sumStakePoolForWindow, utcDateWindow } from "@/lib/escape-room-db";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";

export async function GET(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getEscapeSettings();
  if (!settings) {
    return NextResponse.json({ error: "Game unavailable" }, { status: 503 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const windowKey = utcDateWindow();
  const grossPool = await sumStakePoolForWindow(windowKey);
  const fee = Number(settings.platform_fee_percent);
  const netPool = Math.floor((grossPool * (100 - fee)) / 100);

  const { count: activeApprox } = await supabase
    .from("escape_room_sessions")
    .select("*", { count: "exact", head: true })
    .eq("result", "active");

  const { data: userRow } = await supabase
    .from("users")
    .select("kyc_verified, email")
    .eq("id", userId)
    .maybeSingle();
  const kyc = !!(userRow as { kyc_verified?: boolean } | null)?.kyc_verified;

  const balanceCents = await getCanonicalBalanceCents(userId);

  return NextResponse.json({
    maintenance_banner: settings.maintenance_banner,
    free_play_enabled: settings.free_play_enabled,
    stake_mode_enabled: settings.stake_mode_enabled,
    min_stake_cents: Number(settings.min_stake_cents),
    max_stake_cents: Number(settings.max_stake_cents),
    countdown_seconds: settings.countdown_seconds,
    prize_pool_window: windowKey,
    pool_gross_cents: grossPool,
    pool_net_cents: netPool,
    active_sessions: activeApprox ?? 0,
    kyc_verified: kyc,
    balance_cents: balanceCents,
  });
}
