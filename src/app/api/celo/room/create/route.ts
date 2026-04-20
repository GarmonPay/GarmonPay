import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { creditGpayIdempotent, debitGpayCoins, getUserCoins } from "@/lib/coins";
import { validateEntry } from "@/lib/celo-engine";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";

const MIN_MINIMUM = 500;
const MAX_PLAYERS = [2, 4, 6, 10] as const;

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: {
    name?: unknown;
    max_players?: unknown;
    minimum_entry_sc?: unknown;
    starting_bank_sc?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const maxPlayers = Number(body.max_players);
  const minEntry = Math.floor(Number(body.minimum_entry_sc));
  const startingBank = Math.floor(Number(body.starting_bank_sc));

  if (!name || name.length > 80) {
    return NextResponse.json({ message: "Room name required" }, { status: 400 });
  }
  if (!MAX_PLAYERS.includes(maxPlayers as (typeof MAX_PLAYERS)[number])) {
    return NextResponse.json({ message: "max_players must be 2, 4, 6, or 10" }, { status: 400 });
  }
  if (!Number.isFinite(minEntry) || minEntry < MIN_MINIMUM || minEntry % MIN_MINIMUM !== 0) {
    return NextResponse.json({ message: `minimum_entry_sc must be ≥ ${MIN_MINIMUM} and a multiple of ${MIN_MINIMUM}` }, { status: 400 });
  }
  const v = validateEntry(minEntry, MIN_MINIMUM);
  if (!v.valid) return NextResponse.json({ message: v.error }, { status: 400 });

  if (!Number.isFinite(startingBank) || startingBank < minEntry || startingBank % minEntry !== 0) {
    return NextResponse.json({ message: "starting_bank_sc must be ≥ minimum and a multiple of minimum" }, { status: 400 });
  }

  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < startingBank) {
    return NextResponse.json({ message: "Insufficient GPay Coins (GPC)" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const debitRef = `celo_create_bank_${userId}_${Date.now()}`;
  const debit = await debitGpayCoins(userId, startingBank, "C-Lo table bank (create room)", debitRef, "celo_bank_stake");
  if (!debit.success) {
    return NextResponse.json({ message: debit.message ?? "Debit failed" }, { status: 400 });
  }

  const insertPayload: Record<string, unknown> = {
    name,
    creator_id: userId,
    banker_id: userId,
    status: "waiting",
    room_type: "public",
    max_players: maxPlayers,
    minimum_entry_sc: minEntry,
    current_bank_sc: startingBank,
    platform_fee_pct: 10,
    speed: "regular",
    last_activity: new Date().toISOString(),
  };

  const { data: roomRow, error: insErr } = await supabase.from("celo_rooms").insert(insertPayload).select("*").single();

  if (insErr || !roomRow) {
    await creditGpayIdempotent(userId, startingBank, "C-Lo create refund (room insert failed)", `celo_create_refund_${debitRef}`, "celo_refund");
    return NextResponse.json({ message: insErr?.message ?? "Failed to create room" }, { status: 500 });
  }

  const room = roomRow as Record<string, unknown>;
  const roomId = String(room.id);

  const { error: pErr } = await supabase.from("celo_room_players").insert({
    room_id: roomId,
    user_id: userId,
    role: "banker",
    seat_number: 0,
    entry_sc: 0,
    dice_type: "standard",
  });

  if (pErr) {
    await supabase.from("celo_rooms").delete().eq("id", roomId);
    await creditGpayIdempotent(userId, startingBank, "C-Lo create refund (player insert failed)", `celo_create_refund_${roomId}`, "celo_refund");
    return NextResponse.json({ message: pErr.message }, { status: 500 });
  }

  const norm = normalizeCeloRoomRow(room);
  return NextResponse.json({
    ok: true,
    room: norm,
    room_id: roomId,
    gpayCoins: (await getUserCoins(userId)).gpayCoins,
  });
}
