import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { getUserCoins } from "@/lib/coins";
import { debitGpayCoins } from "@/lib/coins";
import { validateEntry } from "@/lib/celo-engine";

const CLOSED = new Set(["completed", "cancelled"]);

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
  const minEntry =
    Math.max(
      500,
      room.minimum_entry_sc ?? room.min_bet_cents ?? 100
    );
  const { data: existing } = await adminClient
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "You are already at this table" },
      { status: 400 }
    );
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
      .select("*")
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
  const entrySc = Math.floor(Number(body.entry_sc));
  const ve = validateEntry(entrySc, minEntry);
  if (!ve.valid) {
    return NextResponse.json({ error: ve.error }, { status: 400 });
  }
  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < entrySc) {
    return NextResponse.json(
      { error: "Insufficient GPay Coins for this entry" },
      { status: 400 }
    );
  }
  const debit = await debitGpayCoins(
    userId,
    entrySc,
    "C-Lo table entry (join)",
    `celo_join_${roomId}_${userId}`,
    "celo_entry"
  );
  if (!debit.success) {
    return NextResponse.json(
      { error: debit.message ?? "Debit failed" },
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
      entry_sc: entrySc,
      bet_cents: entrySc,
      dice_type: "standard",
    })
    .select("*")
    .single();
  if (iErr || !p) {
    await import("@/lib/coins").then(({ creditCoins }) =>
      creditCoins(
        userId,
        0,
        entrySc,
        "C-Lo join refund (player insert failed)",
        `celo_join_refund_${userId}_${Date.now()}`,
        "celo_bank_refund"
      )
    );
    return NextResponse.json(
      { error: iErr?.message ?? "Join failed" },
      { status: 500 }
    );
  }
  await adminClient
    .from("celo_rooms")
    .update({
      status: "active",
      last_activity: new Date().toISOString(),
    })
    .eq("id", roomId);
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
