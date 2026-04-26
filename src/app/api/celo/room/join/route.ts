import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { celoAccountingLog } from "@/lib/celo-accounting";
import { CELO_ROOM_PLAYERS_USER_EMBED } from "@/lib/celo-player-state";

const CELO_PLAYER_ROW_SELECT = `*,${CELO_ROOM_PLAYERS_USER_EMBED}`;

const CLOSED = new Set(["completed", "cancelled"]);

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
  if (process.env.NODE_ENV === "development") {
    console.log("JOIN REQUEST USER:", userId);
  }
  let body: { room_id?: string; role?: string; entry_sc?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "");
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  const role = (body.role ?? "player") as "player" | "spectator" | "banker";
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
    max_players: number;
    minimum_entry_sc: number | null;
    min_bet_cents: number | null;
  };
  if (CLOSED.has(String(room.status))) {
    return NextResponse.json({ error: "Room is closed" }, { status: 400 });
  }
  const allowSeat =
    String(room.status) === "waiting" || String(room.status) === "entry_phase";
  if (!allowSeat) {
    return NextResponse.json(
      { error: "This room is not accepting new seats right now" },
      { status: 400 }
    );
  }
  const { data: existing } = await adminClient
    .from("celo_room_players")
    .select(CELO_PLAYER_ROW_SELECT)
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    const { data: roomAfter } = await adminClient
      .from("celo_rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    return NextResponse.json({
      already_seated: true,
      player: existing,
      room: roomAfter,
    });
  }
  const { data: allPlayers } = await adminClient
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId);
  const n = (allPlayers ?? []).length;
  if (n >= room.max_players) {
    return NextResponse.json({ error: "Table is full" }, { status: 400 });
  }
  if (role === "spectator") {
    const nextSeat = await getNextSeat(adminClient, roomId, room.max_players);
    const { data: p, error } = await adminClient
      .from("celo_room_players")
      .insert({
        room_id: roomId,
        user_id: userId,
        role: "spectator",
        seat_number: nextSeat,
        entry_sc: 0,
        bet_cents: 0,
        dice_type: "standard",
      })
      .select(CELO_PLAYER_ROW_SELECT)
      .single();
    if (error || !p) {
      return NextResponse.json(
        { error: error?.message ?? "Join failed" },
        { status: 500 }
      );
    }
    const { data: roomAfter } = await adminClient
      .from("celo_rooms")
      .select("*")
      .eq("id", roomId)
      .single();
    return NextResponse.json({ player: p, room: roomAfter });
  }
  if (role !== "player") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const entryScRaw = body.entry_sc != null ? Math.floor(Number(body.entry_sc)) : 0;
  if (entryScRaw > 0) {
    return NextResponse.json(
      {
        error:
          "Taking a seat does not debit your balance. After the banker starts the round, use Post entry to stake.",
      },
      { status: 400 }
    );
  }
  const nextSeat = await getNextSeat(adminClient, roomId, room.max_players);
  const { data: p, error: iErr } = await adminClient
    .from("celo_room_players")
    .insert({
      room_id: roomId,
      user_id: userId,
      role: "player",
      seat_number: nextSeat,
      entry_sc: 0,
      bet_cents: 0,
      dice_type: "standard",
    })
    .select(CELO_PLAYER_ROW_SELECT)
    .single();
  if (
    iErr &&
    (iErr as { code?: string }).code === "23505"
  ) {
    const { data: row } = await adminClient
      .from("celo_room_players")
      .select(CELO_PLAYER_ROW_SELECT)
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();
    if (row) {
      const { data: roomAfter } = await adminClient
        .from("celo_rooms")
        .select("*")
        .eq("id", roomId)
        .single();
      celoAccountingLog("entry_insert_race_idempotent", { roomId, userId });
      return NextResponse.json({
        already_seated: true,
        player: row,
        room: roomAfter,
      });
    }
  }
  if (iErr || !p) {
    return NextResponse.json(
      { error: iErr?.message ?? "Join failed" },
      { status: 500 }
    );
  }
  const { data: roomAfter } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  return NextResponse.json({ player: p, room: roomAfter });
}

async function getNextSeat(
  admin: SupabaseClient,
  roomId: string,
  max: number
): Promise<number> {
  const { data: seats } = await admin
    .from("celo_room_players")
    .select("seat_number")
    .eq("room_id", roomId);
  const used = new Set(
    (seats ?? [])
      .map((s) => s.seat_number as number | null)
      .filter((n) => n != null)
  );
  for (let s = 1; s < max; s += 1) {
    if (!used.has(s)) return s;
  }
  return 1;
}
