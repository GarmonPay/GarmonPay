import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  getEscapeLeaderboard,
  getEscapeRoomSettings,
  getLiveSessions,
  getPrizePoolSnapshot,
} from "@/lib/escape-room-db";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/games/lobby - member-safe lobby snapshot for Stake & Escape */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const [settings, liveSessions, prizePool, leaderboard, walletBalanceCents] = await Promise.all([
      getEscapeRoomSettings(),
      getLiveSessions(),
      getPrizePoolSnapshot(),
      getEscapeLeaderboard(10),
      getCanonicalBalanceCents(userId),
    ]);

    const admin = createAdminClient();
    const userRes = admin
      ? await admin.from("users").select("id, email").eq("id", userId).maybeSingle()
      : { data: null as unknown };
    const user = (userRes.data as { id?: string; email?: string | null } | null) ?? null;

    return NextResponse.json({
      settings: {
        free_play_enabled: settings.free_play_enabled,
        stake_mode_enabled: settings.stake_mode_enabled,
        min_stake_cents: settings.min_stake_cents,
        max_stake_cents: settings.max_stake_cents,
        platform_fee_percent: settings.platform_fee_percent,
        countdown_seconds: settings.countdown_seconds,
        maintenance_banner: settings.maintenance_banner,
      },
      liveSessions: liveSessions.map((s) => ({
        id: s.id,
        email: s.email,
        mode: s.mode,
        stake_cents: s.stake_cents,
        elapsed_seconds: s.elapsed_seconds,
      })),
      prizePool,
      leaderboard,
      wallet_balance_cents: walletBalanceCents,
      user: { id: user?.id ?? userId, email: user?.email ?? "member@garmonpay.local" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load lobby";
    return NextResponse.json({ message }, { status: 500 });
  }
}
