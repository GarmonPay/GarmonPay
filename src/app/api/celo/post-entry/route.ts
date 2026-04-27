import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { creditGpayIdempotent, debitGpayCoins, getUserCoins } from "@/lib/coins";
import { celoAccountingLog } from "@/lib/celo-accounting";
import { validateEntry } from "@/lib/celo-engine";
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
  const amount = Math.floor(Number(body.amount ?? body.entry_sc ?? NaN));

  if (!roomId) {
    return jsonErr("room_id required", 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return jsonErr("amount must be a positive number", 400);
  }

  console.log("[C-Lo PostEntry] request", { roomId, amount, userId });

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

  const minEntry = Math.max(
    500,
    room.minimum_entry_sc ?? room.min_bet_cents ?? 100
  );
  const ve = validateEntry(amount, minEntry);
  if (!ve.valid) {
    return jsonErr(ve.error ?? "Invalid entry amount", 400);
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

  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < amount) {
    return jsonErr("Insufficient GPay Coins for this entry", 400);
  }

  const entryRef = `celo_entry_post_${roomId}_${userId}`;
  celoAccountingLog("entry_debit_post", { roomId, userId, amount, reference: entryRef });

  const debit = await debitGpayCoins(
    userId,
    amount,
    "C-Lo table entry",
    entryRef,
    "celo_entry"
  );
  if (!debit.success) {
    return jsonErr(debit.message ?? "Debit failed", 400);
  }

  const { data: updated, error: uErr } = await adminClient
    .from("celo_room_players")
    .update({
      entry_sc: amount,
      bet_cents: amount,
      entry_posted: true,
      stake_amount_sc: amount,
      status: "active",
      player_seat_status: "active",
    })
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .select(CELO_SELECT)
    .single();

  if (uErr || !updated) {
    const refundRef = `celo_entry_refund_${roomId}_${userId}`;
    await creditGpayIdempotent(
      userId,
      amount,
      "C-Lo post-entry refund (update failed)",
      refundRef,
      "celo_bank_refund"
    );
    return jsonErr(uErr?.message ?? "Could not save entry", 500);
  }

  console.log("[C-Lo PostEntry] updated player", updated);

  let roomAfter = roomRaw as Record<string, unknown>;
  const nextRoomStatus =
    rs === "waiting" ? "active" : rs === "active" ? "active" : "entry_phase";
  if (rs === "waiting" || rs === "entry_phase") {
    const { data: patched, error: roomUpErr } = await adminClient
      .from("celo_rooms")
      .update({
        status: nextRoomStatus,
        last_activity: new Date().toISOString(),
      })
      .eq("id", roomId)
      .select("*")
      .single();
    if (!roomUpErr && patched) {
      roomAfter = patched as Record<string, unknown>;
    }
  } else {
    const { data: touched } = await adminClient
      .from("celo_rooms")
      .update({ last_activity: new Date().toISOString() })
      .eq("id", roomId)
      .select("*")
      .single();
    if (touched) roomAfter = touched as Record<string, unknown>;
  }

  const bankerId = String((roomAfter as { banker_id?: string }).banker_id ?? room.banker_id ?? "");
  const playerOut = shapeCeloRoomStatePlayer(
    updated as Record<string, unknown>,
    bankerId || null
  );

  return NextResponse.json({
    ok: true as const,
    room: roomAfter,
    player: playerOut,
  });
}
