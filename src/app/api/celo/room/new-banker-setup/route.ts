import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { debitGpayCoins } from "@/lib/coins";
import { normalizeCeloUserId } from "@/lib/celo-player-state";
import { validateEntry } from "@/lib/celo-engine";
import { isRoomPauseBlockingActions } from "@/lib/celo-pause";

const MAX_PLAYERS_ALLOWED = new Set([2, 4, 6, 10]);

export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return celoUnauthorizedJsonResponse();
  }
  const { user, adminClient: admin } = auth;
  const userId = user.id;

  let body: {
    room_id?: string;
    name?: string;
    minimum_entry_sc?: number;
    max_players?: number;
    funding_amount_sc?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roomId = String(body.room_id ?? "").trim();
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  const roomName = String(body.name ?? "").trim();
  const minimumEntrySc = Math.floor(Number(body.minimum_entry_sc ?? 0));
  const fundingAmountSc = Math.floor(Number(body.funding_amount_sc ?? 0));
  const maxPlayers = Math.floor(Number(body.max_players ?? 0));

  if (!roomName) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!Number.isFinite(minimumEntrySc) || minimumEntrySc <= 0) {
    return NextResponse.json(
      { error: "minimum_entry_sc must be greater than 0" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(fundingAmountSc) || fundingAmountSc < minimumEntrySc) {
    return NextResponse.json(
      { error: "funding_amount_sc must be at least minimum_entry_sc" },
      { status: 400 }
    );
  }
  if (!MAX_PLAYERS_ALLOWED.has(maxPlayers)) {
    return NextResponse.json(
      { error: "max_players must be one of 2, 4, 6, or 10" },
      { status: 400 }
    );
  }
  const v = validateEntry(fundingAmountSc, minimumEntrySc);
  if (!v.valid) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  const { data: roomRaw, error: roomErr } = await admin
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomRaw as {
    banker_id?: string | null;
    status?: string | null;
    paused_at?: string | null;
    pause_expires_at?: string | null;
  };

  if (isRoomPauseBlockingActions(room)) {
    return NextResponse.json({ error: "Room is paused" }, { status: 400 });
  }
  if (
    !room.banker_id ||
    normalizeCeloUserId(room.banker_id) !== normalizeCeloUserId(userId)
  ) {
    return NextResponse.json(
      { error: "Only the current banker can run new banker setup" },
      { status: 403 }
    );
  }
  const statusLc = String(room.status ?? "").toLowerCase();
  if (statusLc === "cancelled" || statusLc === "completed") {
    return NextResponse.json({ error: "Room is closed" }, { status: 400 });
  }

  const { data: activeRound } = await admin
    .from("celo_rounds")
    .select("id")
    .eq("room_id", roomId)
    .in("status", ["banker_rolling", "player_rolling", "betting"])
    .limit(1);
  if (activeRound && activeRound.length > 0) {
    return NextResponse.json(
      { error: "Cannot run setup during active round settlement/rolling." },
      { status: 400 }
    );
  }

  const debitRef = `celo_new_banker_setup_${roomId}_${userId}_${Date.now()}`;
  const debit = await debitGpayCoins(
    userId,
    fundingAmountSc,
    "C-Lo new banker setup funding",
    debitRef,
    "celo_entry"
  );
  if (!debit.success) {
    return NextResponse.json(
      { error: debit.message ?? "Funding debit failed" },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { data: roomOut, error: upErr } = await admin
    .from("celo_rooms")
    .update({
      name: roomName,
      minimum_entry_sc: minimumEntrySc,
      min_bet_cents: minimumEntrySc,
      max_players: maxPlayers,
      current_bank_sc: fundingAmountSc,
      current_bank_cents: fundingAmountSc,
      bank_busted: false,
      status: "waiting",
      last_activity: now,
    })
    .eq("id", roomId)
    .eq("banker_id", userId)
    .select("*")
    .maybeSingle();

  if (upErr || !roomOut) {
    const { creditCoins } = await import("@/lib/coins");
    await creditCoins(
      userId,
      0,
      fundingAmountSc,
      "C-Lo new banker setup refund",
      `celo_new_banker_setup_refund_${debitRef}`,
      "celo_bank_refund"
    );
    return NextResponse.json(
      { error: upErr?.message ?? "Could not apply new banker setup" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true as const, room: roomOut });
}
