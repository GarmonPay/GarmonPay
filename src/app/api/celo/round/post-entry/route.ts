import { NextResponse } from "next/server";
import { getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { getUserCoins } from "@/lib/coins";
import { debitGpayCoins, creditGpayIdempotent } from "@/lib/coins";
import { validateEntry } from "@/lib/celo-engine";
import { celoAccountingLog } from "@/lib/celo-accounting";
import { CELO_ROOM_PLAYERS_USER_EMBED } from "@/lib/celo-player-state";

const CELO_SELECT = `*,${CELO_ROOM_PLAYERS_USER_EMBED}`;

/**
 * Post stake during room.status = entry_phase (after banker started the entry window).
 */
export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, adminClient } = auth;
  const userId = user.id;
  let body: { room_id?: string; entry_sc?: number };
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
    id: string;
    status: string;
    minimum_entry_sc: number | null;
    min_bet_cents: number | null;
    banker_id: string | null;
  };
  const rs = String(room.status);
  if (rs !== "entry_phase" && rs !== "waiting") {
    return NextResponse.json(
      { error: "Entries can only be posted while the table is waiting for the round to start" },
      { status: 400 }
    );
  }
  const minEntry = Math.max(
    500,
    room.minimum_entry_sc ?? room.min_bet_cents ?? 100
  );
  const entrySc = Math.floor(Number(body.entry_sc));
  const ve = validateEntry(entrySc, minEntry);
  if (!ve.valid) {
    return NextResponse.json({ error: ve.error }, { status: 400 });
  }
  const { data: row, error: pErr } = await adminClient
    .from("celo_room_players")
    .select(CELO_SELECT)
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (pErr || !row) {
    return NextResponse.json({ error: "You are not seated at this table" }, { status: 400 });
  }
  const pl = row as { role: string; entry_sc?: number; bet_cents?: number };
  if (String(pl.role) !== "player") {
    return NextResponse.json(
      { error: "Only players in a player seat can post an entry" },
      { status: 400 }
    );
  }
  if (Math.floor(Number(pl.entry_sc ?? 0)) > 0 || Math.floor(Number(pl.bet_cents ?? 0)) > 0) {
    return NextResponse.json(
      { error: "You already posted an entry for this round" },
      { status: 400 }
    );
  }
  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < entrySc) {
    return NextResponse.json(
      { error: "Insufficient GPay Coins for this entry" },
      { status: 400 }
    );
  }
  const entryRef = `celo_entry_post_${roomId}_${userId}`;
  celoAccountingLog("entry_debit_post_phase", { roomId, userId, entrySc, reference: entryRef });
  const debit = await debitGpayCoins(
    userId,
    entrySc,
    "C-Lo table entry (entry phase)",
    entryRef,
    "celo_entry"
  );
  if (!debit.success) {
    return NextResponse.json(
      { error: debit.message ?? "Debit failed" },
      { status: 400 }
    );
  }
  const { data: updated, error: uErr } = await adminClient
    .from("celo_room_players")
    .update({
      entry_sc: entrySc,
      bet_cents: entrySc,
    })
    .eq("id", (row as { id: string }).id)
    .eq("room_id", roomId)
    .select(CELO_SELECT)
    .single();
  if (uErr || !updated) {
    const refundRef = `celo_entry_refund_${roomId}_${userId}`;
    await creditGpayIdempotent(
      userId,
      entrySc,
      "C-Lo post-entry refund (update failed)",
      refundRef,
      "celo_bank_refund"
    );
    return NextResponse.json(
      { error: uErr?.message ?? "Could not save entry" },
      { status: 500 }
    );
  }
  const { data: roomAfter } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  return NextResponse.json({ player: updated, room: roomAfter });
}
