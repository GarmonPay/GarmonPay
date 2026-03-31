import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";
import { createAdminClient } from "@/lib/supabase";
import {
  ensurePlayerStatusRow,
  getEscapeSettings,
  getPlayerEscapeStatus,
  getPuzzleForPlay,
  logTimer,
  toPublicPuzzle,
  utcDateWindow,
} from "@/lib/escape-room-db";

export async function POST(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "stake" ? "stake" : "free";
  const stakeRaw = typeof body.stake_cents === "number" ? Math.round(body.stake_cents) : 0;
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const deviceFingerprint = typeof body.device_fingerprint === "string" ? body.device_fingerprint : null;
  const ua = request.headers.get("user-agent");

  const settings = await getEscapeSettings();
  if (!settings) {
    return NextResponse.json({ error: "Game unavailable" }, { status: 503 });
  }
  if (settings.maintenance_banner?.trim()) {
    return NextResponse.json(
      { error: "maintenance", message: settings.maintenance_banner },
      { status: 503 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  await ensurePlayerStatusRow(userId);
  const ps = await getPlayerEscapeStatus(userId);
  if (ps?.status === "banned" || ps?.status === "suspended") {
    return NextResponse.json({ error: "Account cannot play Stake & Escape" }, { status: 403 });
  }

  const { data: existingActive } = await supabase
    .from("escape_room_sessions")
    .select("id")
    .eq("player_id", userId)
    .eq("result", "active")
    .limit(1)
    .maybeSingle();
  if (existingActive) {
    return NextResponse.json(
      { error: "active_session", session_id: (existingActive as { id: string }).id },
      { status: 409 }
    );
  }

  if (mode === "free" && !settings.free_play_enabled) {
    return NextResponse.json({ error: "Free play disabled" }, { status: 403 });
  }
  if (mode === "stake" && !settings.stake_mode_enabled) {
    return NextResponse.json({ error: "Stake mode disabled" }, { status: 403 });
  }

  const { data: profile } = await supabase
    .from("users")
    .select("kyc_verified")
    .eq("id", userId)
    .maybeSingle();
  const kyc = !!(profile as { kyc_verified?: boolean } | null)?.kyc_verified;

  let stakeCents = 0;
  if (mode === "stake") {
    if (!kyc) {
      return NextResponse.json({ error: "KYC verification required for Stake mode" }, { status: 403 });
    }
    const minS = Number(settings.min_stake_cents);
    const maxS = Number(settings.max_stake_cents);
    stakeCents = stakeRaw;
    if (stakeCents < minS || stakeCents > maxS) {
      return NextResponse.json(
        { error: `Stake must be between ${minS} and ${maxS} cents` },
        { status: 400 }
      );
    }
    const balance = await getCanonicalBalanceCents(userId);
    if (balance < stakeCents) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
    }
    const ref = `escape_stake_${userId}_${Date.now()}`;
    const debit = await walletLedgerEntry(userId, "game_play", -stakeCents, ref);
    if (!debit.success) {
      return NextResponse.json({ error: debit.message ?? "Insufficient balance" }, { status: 400 });
    }
  }

  const day = utcDateWindow();
  const puzzle = await getPuzzleForPlay(settings, day);
  if (!puzzle) {
    if (mode === "stake" && stakeCents > 0) {
      await walletLedgerEntry(userId, "admin_adjustment", stakeCents, `escape_refund_nopuzzle_${Date.now()}`);
    }
    return NextResponse.json({ error: "No puzzle available for today" }, { status: 503 });
  }

  const countdown = settings.countdown_seconds;
  const { data: inserted, error: insErr } = await supabase
    .from("escape_room_sessions")
    .insert({
      player_id: userId,
      mode,
      stake_cents: stakeCents,
      countdown_seconds: countdown,
      puzzle_id: puzzle.id,
      prize_pool_window: day,
      ip_address: ip,
      device_fingerprint: deviceFingerprint,
      user_agent: ua,
    })
    .select("id, started_at, countdown_seconds")
    .single();

  if (insErr || !inserted) {
    if (mode === "stake" && stakeCents > 0) {
      await walletLedgerEntry(userId, "admin_adjustment", stakeCents, `escape_refund_insertfail_${Date.now()}`);
    }
    console.error("escape start insert", insErr);
    return NextResponse.json({ error: "Could not start session" }, { status: 500 });
  }

  const row = inserted as { id: string; started_at: string; countdown_seconds: number };
  await logTimer(row.id, "start", {
    mode,
    stake_cents: stakeCents,
    puzzle_id: puzzle.id,
    countdown_seconds: countdown,
  });

  const endsAt = new Date(
    new Date(row.started_at).getTime() + row.countdown_seconds * 1000
  ).toISOString();

  return NextResponse.json({
    session_id: row.id,
    started_at: row.started_at,
    ends_at: endsAt,
    countdown_seconds: row.countdown_seconds,
    mode,
    stake_cents: stakeCents,
    puzzle: toPublicPuzzle(puzzle),
    prize_pool_window: day,
  });
}
