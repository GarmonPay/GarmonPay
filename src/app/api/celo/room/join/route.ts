import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { debitGpayCoins, getUserCoins } from "@/lib/coins";
import { validateEntry } from "@/lib/celo-engine";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: { room_id?: unknown; role?: unknown; entry_sc?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  const role = body.role === "player" || body.role === "spectator" ? body.role : null;
  const entrySc = Math.floor(Number(body.entry_sc ?? 0));

  if (!roomId || !role) {
    return NextResponse.json({ message: "room_id and role (player|spectator) required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: roomRaw, error: rErr } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
  if (rErr || !roomRaw) return NextResponse.json({ message: "Room not found" }, { status: 404 });

  const room = roomRaw as Record<string, unknown>;
  const status = String(room.status ?? "");
  if (!["waiting", "active", "rolling"].includes(status)) {
    return NextResponse.json({ message: "Room is not open" }, { status: 400 });
  }

  const maxPlayers = Number(room.max_players ?? 6);
  const minimumEntry = Math.floor(Number(room.minimum_entry_sc ?? room.min_bet_cents ?? 500));

  const { data: existing } = await supabase.from("celo_room_players").select("id").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
  if (existing) {
    return NextResponse.json({ message: "Already in this room" }, { status: 400 });
  }

  const { count } = await supabase
    .from("celo_room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  if ((count ?? 0) >= maxPlayers) {
    return NextResponse.json({ message: "Room is full" }, { status: 400 });
  }

  if (role === "spectator") {
    const { error: jErr } = await supabase.from("celo_room_players").insert({
      room_id: roomId,
      user_id: userId,
      role: "spectator",
      seat_number: null,
      entry_sc: 0,
      bet_cents: 0,
      dice_type: "standard",
    });
    if (jErr) return NextResponse.json({ message: jErr.message }, { status: 500 });
  } else {
    const v = validateEntry(entrySc, minimumEntry);
    if (!v.valid) return NextResponse.json({ message: v.error }, { status: 400 });

    const { gpayCoins } = await getUserCoins(userId);
    if (gpayCoins < entrySc) {
      return NextResponse.json({ message: "Insufficient GPay Coins (GPC)" }, { status: 400 });
    }

    const debitRef = `celo_join_${roomId}_${userId}`;
    const debit = await debitGpayCoins(userId, entrySc, "C-Lo table entry (join)", debitRef, "celo_entry");
    if (!debit.success) {
      return NextResponse.json({ message: debit.message ?? "Debit failed" }, { status: 400 });
    }

    const { data: seats } = await supabase
      .from("celo_room_players")
      .select("seat_number")
      .eq("room_id", roomId)
      .not("seat_number", "is", null);

    const used = new Set((seats ?? []).map((s) => Number((s as { seat_number: number }).seat_number)));
    let seat = 1;
    while (used.has(seat) && seat < 20) seat++;

    const { error: jErr } = await supabase.from("celo_room_players").insert({
      room_id: roomId,
      user_id: userId,
      role: "player",
      seat_number: seat,
      entry_sc: entrySc,
      bet_cents: entrySc,
      dice_type: "standard",
    });
    if (jErr) {
      return NextResponse.json({ message: jErr.message }, { status: 500 });
    }

    const { count: playerCount } = await supabase
      .from("celo_room_players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("role", "player");

    if ((playerCount ?? 0) === 1 && status === "waiting") {
      await supabase.from("celo_rooms").update({ status: "active", last_activity: new Date().toISOString() }).eq("id", roomId);
    }
  }

  const { data: players } = await supabase.from("celo_room_players").select("*").eq("room_id", roomId);

  const { data: roomAfter } = await supabase.from("celo_rooms").select("*").eq("id", roomId).single();

  return NextResponse.json({
    ok: true,
    room: normalizeCeloRoomRow(roomAfter as Record<string, unknown>),
    players: players ?? [],
    gpayCoins: (await getUserCoins(userId)).gpayCoins,
  });
}
