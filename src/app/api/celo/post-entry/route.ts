import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { getUserCoins } from "@/lib/coins";
import { celoAccountingLog } from "@/lib/celo-accounting";
import { validatePlayerStake } from "@/lib/celo-engine";
import {
  CELO_ROOM_PLAYERS_USER_EMBED,
  normalizeCeloUserId,
  shapeCeloRoomStatePlayer,
} from "@/lib/celo-player-state";

const CELO_SELECT = `*,${CELO_ROOM_PLAYERS_USER_EMBED}`;

const ALLOWED_ROOM = new Set(["waiting", "active", "entry_phase"]);
const BLOCKED_ROOM = new Set(["rolling", "completed"]);

function jsonErr(message: string, status: number) {
  return NextResponse.json({ ok: false as const, error: message }, { status });
}

/**
 * Player posts a table entry (debit GPC, update celo_room_players).
 * Body: { roomId, amount } (also accepts room_id + entry_sc for compatibility).
 */
export async function POST(request: Request) {
  console.log("[C-Lo PostEntry] HIT ROUTE");
  const clients = await getCeloApiClients();
  if (!clients) {
    return jsonErr("Server not configured", 500);
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return celoUnauthorizedJsonResponse();
  }
  const { user, adminClient } = auth;
  const userId = user.id;

  let body: { roomId?: string; room_id?: string; amount?: number; entry_sc?: number };
  try {
    body = await request.json();
  } catch {
    return jsonErr("Invalid JSON", 400);
  }

  const roomId = String(body.roomId ?? body.room_id ?? "").trim();
  const rawAmount = Number(body.amount ?? body.entry_sc ?? NaN);
  const stakeSc = Math.floor(rawAmount);

  if (!roomId) {
    return jsonErr("room_id required", 400);
  }
  if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount) || stakeSc <= 0) {
    return jsonErr("amount must be a positive whole number of GPC", 400);
  }

  console.log("[C-Lo PostEntry] roomId, userId, amount", { roomId, userId, amount: stakeSc });

  const { data: roomRaw, error: rErr } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (rErr || !roomRaw) {
    return jsonErr("Room not found", 404);
  }

  const room = roomRaw as {
    id: string;
    status: string;
    minimum_entry_sc: number | null;
    min_bet_cents: number | null;
    banker_id: string | null;
    current_bank_sc?: number | null;
    current_bank_cents?: number | null;
  };

  const rs = String(room.status ?? "");
  if (BLOCKED_ROOM.has(rs)) {
    return jsonErr(
      rs === "rolling"
        ? "Cannot post entry while a round is in progress"
        : "Cannot post entry for this room state",
      400
    );
  }
  if (!ALLOWED_ROOM.has(rs)) {
    return jsonErr("Entries cannot be posted in this room state", 400);
  }

  const { data: activeRounds } = await adminClient
    .from("celo_rounds")
    .select("id")
    .eq("room_id", roomId)
    .in("status", ["banker_rolling", "player_rolling", "betting"])
    .limit(1);
  if (activeRounds && activeRounds.length > 0) {
    return jsonErr("A round is already in progress", 400);
  }

  if (
    room.banker_id != null &&
    normalizeCeloUserId(room.banker_id) === normalizeCeloUserId(userId)
  ) {
    return jsonErr("The banker cannot post a player entry", 403);
  }

  const minEntrySc = Math.max(
    500,
    room.minimum_entry_sc ?? room.min_bet_cents ?? 100
  );
  const currentBankSc = Math.max(
    0,
    Math.floor(
      Number(room.current_bank_sc ?? room.current_bank_cents ?? 0)
    )
  );

  const { gpayCoins: playerBalanceSc } = await getUserCoins(userId);
  console.log("[C-Lo bank stop validation]", {
    roomId,
    userId,
    minEntrySc,
    currentBankSc,
    requestedStakeSc: stakeSc,
    playerBalanceSc,
  });

  const ve = validatePlayerStake(stakeSc, minEntrySc, currentBankSc);
  if (!ve.valid) {
    return jsonErr(ve.error ?? "Invalid entry amount", 400);
  }
  if (stakeSc > playerBalanceSc) {
    return jsonErr("Insufficient GPC balance.", 400);
  }

  const { data: row, error: pErr } = await adminClient
    .from("celo_room_players")
    .select(CELO_SELECT)
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (pErr || !row) {
    return jsonErr("You are not seated at this table", 400);
  }

  const pl = row as {
    id: string;
    role: string;
    entry_sc?: number;
    bet_cents?: number;
    entry_posted?: boolean;
    stake_amount_sc?: number;
  };

  console.log("[C-Lo PostEntry] existing player", pl);

  if (String(pl.role ?? "").trim().toLowerCase() !== "player") {
    return jsonErr("Only players in a player seat can post an entry", 400);
  }

  const alreadyPosted =
    pl.entry_posted === true ||
    Math.floor(Number(pl.stake_amount_sc ?? 0)) > 0 ||
    Math.floor(Number(pl.entry_sc ?? 0)) > 0 ||
    Math.floor(Number(pl.bet_cents ?? 0)) > 0;
  if (alreadyPosted) {
    return jsonErr("You already posted an entry for this round", 400);
  }

  const entryRef = `celo:post-entry:${roomId}:${userId}:${Date.now()}:${crypto.randomUUID()}`;
  celoAccountingLog("entry_debit_post", { roomId, userId, amount: stakeSc, reference: entryRef });

  const { data: rpcResult, error: rpcError } = await adminClient.rpc(
    "celo_post_entry_atomic",
    {
      p_room_id: roomId,
      p_user_id: userId,
      p_amount: stakeSc,
      p_reference: entryRef,
    }
  );

  type RpcPayload = { success?: boolean; message?: string };
  const payload = rpcResult as RpcPayload | null;

  if (rpcError) {
    console.error("[C-Lo PostEntry] RPC error", rpcError);
    return jsonErr(rpcError.message ?? "Could not post entry", 400);
  }

  if (!payload || payload.success !== true) {
    const msg =
      typeof payload?.message === "string" && payload.message.trim()
        ? payload.message
        : "Could not post entry";
    console.log("[C-Lo PostEntry] RPC logical failure", payload);
    return jsonErr(msg, 400);
  }

  const { data: roomAfterRow, error: roomFetchErr } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  const { data: playerAfter, error: playerFetchErr } = await adminClient
    .from("celo_room_players")
    .select(CELO_SELECT)
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (roomFetchErr || playerFetchErr || !roomAfterRow || !playerAfter) {
    console.error("[C-Lo PostEntry] post-RPC fetch failed", {
      roomFetchErr,
      playerFetchErr,
      roomAfterRow,
      playerAfter,
    });
    return jsonErr("Entry posted but room state could not be loaded", 500);
  }

  const roomAfter = roomAfterRow as Record<string, unknown>;
  const bankerId = String(
    (roomAfter as { banker_id?: string }).banker_id ?? room.banker_id ?? ""
  );
  const playerOut = shapeCeloRoomStatePlayer(
    playerAfter as Record<string, unknown>,
    bankerId || null
  );

  return NextResponse.json({
    ok: true as const,
    room: roomAfter,
    player: playerOut,
  });
}
