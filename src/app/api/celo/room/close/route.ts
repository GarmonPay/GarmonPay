import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

function playerEntryCents(row: { entry_sc?: number | null; bet_cents?: number | null }): number {
  const n = Number(row.entry_sc ?? row.bet_cents ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * POST /api/celo/room/close — banker (or creator) closes room: refund player entries + bank, cancel room.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { room_id } = body as { room_id?: string };
  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const { data: room, error: roomErr } = await supabase.from("celo_rooms").select("*").eq("id", room_id).maybeSingle();
  if (roomErr || !room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const raw = room as Record<string, unknown>;
  const normalized = normalizeCeloRoomRow(raw);
  if (!normalized) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const bankerId = String(raw.banker_id ?? normalized.banker_id ?? "");
  const creatorId = String(raw.creator_id ?? "");
  const isBanker = !!bankerId && bankerId === String(userId);
  const isCreator = !!creatorId && creatorId === String(userId);
  if (!isBanker && !isCreator) {
    return NextResponse.json({ error: "Only the banker or room creator can close this room" }, { status: 403 });
  }

  const status = String(normalized.status ?? "");
  if (status === "cancelled" || status === "completed") {
    return NextResponse.json({ error: "Room is already closed" }, { status: 400 });
  }

  const { data: activeRound } = await supabase
    .from("celo_rounds")
    .select("id")
    .eq("room_id", room_id)
    .neq("status", "completed")
    .maybeSingle();

  if (activeRound) {
    return NextResponse.json({ error: "Cannot close while a round is in progress" }, { status: 400 });
  }

  const { data: playerRows, error: playersErr } = await supabase
    .from("celo_room_players")
    .select("user_id, role, entry_sc, bet_cents")
    .eq("room_id", room_id);

  if (playersErr) {
    return NextResponse.json({ error: "Could not load players" }, { status: 500 });
  }

  const rows = (playerRows ?? []) as Array<{
    user_id: string;
    role: string;
    entry_sc?: number | null;
    bet_cents?: number | null;
  }>;

  let refundsIssued = 0;
  const ts = Date.now();

  for (const p of rows) {
    if (p.role !== "player") continue;
    const cents = playerEntryCents(p);
    if (cents <= 0) continue;
    const ref = `celo_room_close_refund_${room_id}_${p.user_id}_${ts}_${refundsIssued}`;
    const result = await walletLedgerEntry(p.user_id, "game_win", cents, ref);
    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? "Refund failed", details: `player ${p.user_id}` },
        { status: 500 }
      );
    }
    refundsIssued += 1;
  }

  const bankCents = normalized.current_bank_cents ?? 0;
  if (bankCents > 0 && bankerId) {
    const bankRef = `celo_room_close_bank_refund_${room_id}_${ts}`;
    const bankResult = await walletLedgerEntry(bankerId, "game_win", bankCents, bankRef);
    if (!bankResult.success) {
      return NextResponse.json(
        { error: bankResult.message ?? "Could not refund bank to banker" },
        { status: 500 }
      );
    }
  }

  const { error: delPlayersErr } = await supabase.from("celo_room_players").delete().eq("room_id", room_id);
  if (delPlayersErr) {
    return NextResponse.json({ error: delPlayersErr.message ?? "Failed to clear players" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("celo_rooms")
    .update({ status: "cancelled", last_activity: now })
    .eq("id", room_id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message ?? "Failed to update room" }, { status: 500 });
  }

  await supabase.from("celo_audit_log").insert({
    room_id,
    user_id: userId,
    action: "room_closed",
    details: {
      reason: "banker_closed",
      refunds_issued: refundsIssued,
      bank_refunded_cents: bankCents,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Room closed and refunds issued",
  });
}
