import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import {
  CELO_ROOM_PLAYERS_USER_EMBED,
  isStakedNonBankerForStartRound,
  normalizeCeloUserId,
} from "@/lib/celo-player-state";
import { isRoomPauseBlockingActions } from "@/lib/celo-pause";
import { generateCeloIdlePreviewDiceTriplet } from "@/lib/celo-idle-preview-server";

const STARTABLE_ROOM_STATUSES = new Set([
  "waiting",
  "active",
  "entry_phase",
  "bank_takeover",
]);

function isMissingSettlementVersionError(err: { message?: string; code?: string } | null): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  if (!msg.includes("settlement_version")) return false;
  return msg.includes("schema cache") || msg.includes("column");
}

function isMissingIdlePreviewDiceColumnError(err: { message?: string; code?: string } | null): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  if (!msg.includes("idle_preview_dice")) return false;
  return msg.includes("schema cache") || msg.includes("column") || msg.includes("could not find");
}

/**
 * Banker starts the round: creates celo_rounds (banker_rolling) and sets room to rolling.
 * Requires at least one staked non-banker player (posted entry).
 */
export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return celoUnauthorizedJsonResponse();
  }
  const { user, adminClient } = auth;
  const userId = user.id;
  let body: { room_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "");
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  const { data: roomRaw, error: rErr } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (rErr || !roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomRaw as {
    banker_id: string | null;
    id: string;
    status: string;
    total_rounds?: number;
    current_bank_sc?: number | null;
    current_bank_cents?: number | null;
    bank_busted?: boolean | null;
    paused_at?: string | null;
  };
  if (isRoomPauseBlockingActions(room)) {
    return NextResponse.json({ error: "Room is paused" }, { status: 400 });
  }
  if (!room.banker_id) {
    return NextResponse.json(
      { error: "No banker assigned to this table" },
      { status: 400 }
    );
  }
  if (room.bank_busted === true) {
    return NextResponse.json(
      { error: "Bank is busted. Assign a banker before starting a round." },
      { status: 400 }
    );
  }
  const curBank = Math.max(
    0,
    Math.floor(
      Number(room.current_bank_sc ?? room.current_bank_cents ?? 0)
    )
  );
  if (curBank <= 0) {
    return NextResponse.json(
      { error: "Table bank is empty. Fund the bank before starting a round." },
      { status: 400 }
    );
  }
  if (normalizeCeloUserId(room.banker_id) !== normalizeCeloUserId(userId)) {
    return NextResponse.json(
      { error: "Only the banker can start a round" },
      { status: 403 }
    );
  }
  if (!STARTABLE_ROOM_STATUSES.has(String(room.status))) {
    return NextResponse.json(
      { error: "Room is not in a state where a new round can start" },
      { status: 400 }
    );
  }
  const { data: active } = await adminClient
    .from("celo_rounds")
    .select("id, status")
    .eq("room_id", roomId)
    .in("status", ["banker_rolling", "player_rolling", "betting"])
    .limit(1);
  if (active && active.length > 0) {
    return NextResponse.json(
      { error: "A round is already in progress" },
      { status: 400 }
    );
  }
  const { data: players } = await adminClient
    .from("celo_room_players")
    .select(
      `user_id, role, entry_sc, bet_cents, entry_posted, stake_amount_sc,${CELO_ROOM_PLAYERS_USER_EMBED}`
    )
    .eq("room_id", roomId);
  const staked = (players ?? []).filter((p) =>
    isStakedNonBankerForStartRound(
      p as {
        role?: string;
        user_id?: string;
        entry_sc?: number;
        bet_cents?: number;
        entry_posted?: boolean;
        stake_amount_sc?: number;
      },
      room.banker_id ?? null
    )
  );
  console.log("[C-Lo StartRound] staked players", staked);
  if (staked.length < 1) {
    return NextResponse.json(
      { error: "At least one player with a posted entry is required" },
      { status: 400 }
    );
  }
  const prizePool = staked.reduce(
    (s, p) => s + Math.floor(Number((p as { stake_amount_sc?: number }).stake_amount_sc ?? 0)),
    0
  );
  const { count: prev } = await adminClient
    .from("celo_rounds")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);
  const roundNumber = (prev ?? 0) + 1;
  const idlePreviewDice = generateCeloIdlePreviewDiceTriplet();
  const insertBase = {
    room_id: roomId,
    round_number: roundNumber,
    banker_id: userId,
    status: "banker_rolling" as const,
    prize_pool_sc: prizePool,
    platform_fee_sc: 0,
    bank_covered: false,
    bank_at_round_start_sc: curBank,
  };
  let round: Record<string, unknown> | null = null;
  let insErr: { message?: string; code?: string } | null = null;

  ({ data: round, error: insErr } = await adminClient
    .from("celo_rounds")
    .insert({
      ...insertBase,
      settlement_version: 2,
      idle_preview_dice: idlePreviewDice,
    })
    .select("*")
    .single());

  if (insErr && isMissingIdlePreviewDiceColumnError(insErr)) {
    ({ data: round, error: insErr } = await adminClient
      .from("celo_rounds")
      .insert({
        ...insertBase,
        settlement_version: 2,
      })
      .select("*")
      .single());
  }

  if (insErr && isMissingSettlementVersionError(insErr)) {
    ({ data: round, error: insErr } = await adminClient
      .from("celo_rounds")
      .insert({
        ...insertBase,
        idle_preview_dice: idlePreviewDice,
      })
      .select("*")
      .single());
  }

  if (insErr && isMissingIdlePreviewDiceColumnError(insErr)) {
    ({ data: round, error: insErr } = await adminClient
      .from("celo_rounds")
      .insert({ ...insertBase })
      .select("*")
      .single());
  }

  if (insErr || !round) {
    return NextResponse.json(
      { error: insErr?.message ?? "Could not start round" },
      { status: 500 }
    );
  }
  const { data: roomAfter, error: upErr } = await adminClient
    .from("celo_rooms")
    .update({
      status: "rolling",
      last_activity: new Date().toISOString(),
    })
    .eq("id", roomId)
    .select("*")
    .single();
  if (upErr || !roomAfter) {
    return NextResponse.json(
      { error: upErr?.message ?? "Could not update room" },
      { status: 500 }
    );
  }
  return NextResponse.json({ round, room: roomAfter });
}
