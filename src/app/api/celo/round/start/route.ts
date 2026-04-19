import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { assertSumStakesWithinReserve } from "@/lib/celo-banker-reserve";
import { celoQaLog } from "@/lib/celo-qa-log";
import { celoSameAuthUserId, countPlayersWithPositiveStake } from "@/lib/celo-room-rules";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { room_id } = body as { room_id?: string };
  if (!room_id) {
    return NextResponse.json({ ok: false, error: "room_id required" }, { status: 400 });
  }

  const { data: roomRows, error: roomFetchErr } = await supabase
    .from("celo_rooms")
    .select("*")
    .eq("id", room_id)
    .limit(1);
  const room = celoFirstRow(roomRows);
  if (roomFetchErr || !room) {
    return NextResponse.json({ ok: false, error: "Room not found" }, { status: 404 });
  }

  const roomRecord = normalizeCeloRoomRow(room as Record<string, unknown>) as {
    id: string;
    status: string;
    banker_id: string;
    platform_fee_pct: number;
    current_bank_cents: number;
    banker_reserve_cents: number;
  };

  console.log("[celo/round/start] request", {
    room_id,
    userId,
    roomStatus: roomRecord.status,
    banker_id: roomRecord.banker_id,
  });

  // Only the banker may start a round (UUID formatting may differ between JWT and DB)
  if (!celoSameAuthUserId(String(roomRecord.banker_id ?? ""), userId)) {
    celoQaLog("banker_start_rejected", {
      room_id,
      reason: "not_banker",
      userId,
      banker_id: roomRecord.banker_id,
      roomStatus: roomRecord.status,
    });
    console.warn("[celo/round/start] banker mismatch", {
      room_id,
      userId,
      banker_id: roomRecord.banker_id,
    });
    return NextResponse.json({ ok: false, error: "Only banker can start round" }, { status: 403 });
  }

  const roomStatus = String(roomRecord.status ?? "");
  if (roomStatus !== "active" && roomStatus !== "waiting") {
    const errMsg =
      roomStatus === "rolling"
        ? "Room is already rolling"
        : `Room status does not allow starting (${roomStatus})`;
    celoQaLog("banker_start_rejected", {
      room_id,
      reason: "room_not_open",
      userId,
      roomStatus: roomRecord.status,
    });
    console.warn("[celo/round/start] room not startable", { room_id, roomStatus });
    return NextResponse.json({ ok: false, error: errMsg }, { status: 400 });
  }

  if (roomStatus === "waiting") {
    const now = new Date().toISOString();
    await supabase.from("celo_rooms").update({ status: "active", last_activity: now }).eq("id", room_id).eq("status", "waiting");
  }

  // Ensure no round is currently in progress
  const { count: incompleteRoundCount, error: ipErr } = await supabase
    .from("celo_rounds")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room_id)
    .neq("status", "completed");

  if (ipErr) {
    console.error("[celo/round/start] active round count failed", { room_id, message: ipErr.message });
    return NextResponse.json(
      { ok: false, error: "Failed to verify active rounds", details: ipErr.message },
      { status: 500 }
    );
  }
  if ((incompleteRoundCount ?? 0) > 0) {
    celoQaLog("banker_start_rejected", {
      room_id,
      reason: "round_in_progress",
      userId,
      incompleteRounds: incompleteRoundCount ?? 0,
      roomStatus: roomRecord.status,
    });
    console.warn("[celo/round/start] incomplete round exists", {
      room_id,
      incompleteRoundCount,
    });
    return NextResponse.json({ ok: false, error: "Active round already exists" }, { status: 400 });
  }

  const withStake = await countPlayersWithPositiveStake(supabase, room_id);
  console.log("[celo/round/start] players_with_stake", { room_id, withStake });
  if (withStake < 1) {
    celoQaLog("banker_start_rejected", {
      room_id,
      reason: "no_players_with_stake",
      userId,
      playersWithStake: withStake,
      roomStatus: roomRecord.status,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Cannot start round without at least 1 seated player with an entry",
      },
      { status: 400 }
    );
  }

  // Get seated players; stake may be in entry_sc and/or bet_cents
  const { data: playerRows } = await supabase
    .from("celo_room_players")
    .select("user_id, bet_cents, entry_sc, role")
    .eq("room_id", room_id)
    .eq("role", "player");

  const players = (playerRows ?? []).filter((p) => celoPlayerStakeCents(p as { entry_sc?: number; bet_cents?: number }) > 0) as {
    user_id: string;
    bet_cents?: number;
    entry_sc?: number;
  }[];

  if (players.length === 0) {
    celoQaLog("banker_start_rejected", {
      room_id,
      reason: "player_rows_empty_after_filter",
      userId,
      roomStatus: roomRecord.status,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Cannot start round without at least 1 seated player with an entry",
      },
      { status: 400 }
    );
  }

  const entryForPot = (p: { bet_cents?: number; entry_sc?: number }) => celoPlayerStakeCents(p);

  const totalPotCents = players.reduce((sum, p) => sum + entryForPot(p), 0);

  const reserveOk = assertSumStakesWithinReserve({
    reserveCents: roomRecord.banker_reserve_cents,
    sumStakesCents: totalPotCents,
    messageWhenExceeded:
      "Round pot exceeds the banker reserved liability cap; refuse to start (data invariant).",
  });
  if (!reserveOk.ok) {
    console.error("[celo/round/start] reserve invariant failed", {
      room_id,
      totalPotCents,
      reserve: roomRecord.banker_reserve_cents,
    });
    return NextResponse.json({ ok: false, error: reserveOk.message }, { status: 409 });
  }

  const platformFeeCents = Math.floor(
    (totalPotCents * roomRecord.platform_fee_pct) / 100
  );

  // Get next round number
  const { count: roundCount } = await supabase
    .from("celo_rounds")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room_id);

  const roundNumber = (roundCount ?? 0) + 1;

  // Insert new round
  const { data: newRoundRows, error: roundErr } = await supabase
    .from("celo_rounds")
    .insert({
      room_id,
      round_number: roundNumber,
      banker_id: roomRecord.banker_id,
      status: "banker_rolling",
      prize_pool_sc: totalPotCents,
      platform_fee_sc: platformFeeCents,
    })
    .select()
    .limit(1);

  const newRound = celoFirstRow(newRoundRows);
  if (roundErr || !newRound) {
    console.error("[celo/round/start] insert failed", {
      room_id,
      message: roundErr?.message,
      code: roundErr?.code,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to create round row",
        details: roundErr?.message ?? null,
        code: roundErr?.code ?? null,
      },
      { status: 500 }
    );
  }

  // Update room status
  const { error: roomUpdErr } = await supabase
    .from("celo_rooms")
    .update({ status: "rolling", last_activity: new Date().toISOString(), last_round_was_celo: false })
    .eq("id", room_id);

  if (roomUpdErr) {
    console.error("[celo/round/start] room update failed after round insert", {
      room_id,
      round_id: (newRound as { id: string }).id,
      message: roomUpdErr.message,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Failed to update room status",
        details: roomUpdErr.message,
      },
      { status: 500 }
    );
  }

  console.log("[celo/round/start] round_started", {
    room_id,
    userId,
    round_id: (newRound as { id: string }).id,
    playersWithStake: players.length,
    status: "banker_rolling",
  });

  await supabase.from("celo_audit_log").insert({
    room_id,
    round_id: (newRound as { id: string }).id,
    user_id: userId,
    action: "round_started",
    details: {
      round_number: roundNumber,
      prize_pool_sc: totalPotCents,
      platform_fee_sc: platformFeeCents,
      player_count: players.length,
    },
  });

  return NextResponse.json({ ok: true, round: newRound });
}
