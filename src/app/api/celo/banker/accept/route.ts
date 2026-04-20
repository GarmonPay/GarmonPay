import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { debitGpayCoins, getUserCoins } from "@/lib/coins";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: { room_id?: unknown; round_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  const roundId = typeof body.round_id === "string" ? body.round_id : null;
  if (!roomId || !roundId) return NextResponse.json({ message: "room_id and round_id required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: roundRaw } = await supabase.from("celo_rounds").select("*").eq("id", roundId).maybeSingle();
  if (!roundRaw) return NextResponse.json({ message: "Round not found" }, { status: 404 });

  const round = roundRaw as Record<string, unknown>;
  if (String(round.room_id) !== roomId) return NextResponse.json({ message: "Invalid round" }, { status: 400 });

  if (!round.player_celo_offer) {
    return NextResponse.json({ message: "No banker offer is active" }, { status: 400 });
  }

  const exp = round.player_celo_expires_at ? new Date(String(round.player_celo_expires_at)).getTime() : 0;
  if (!exp || Date.now() > exp) {
    return NextResponse.json({ message: "Offer expired" }, { status: 400 });
  }

  const { data: roomRaw } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
  if (!roomRaw) return NextResponse.json({ message: "Room not found" }, { status: 404 });

  const room = roomRaw as Record<string, unknown>;
  const bank = Math.floor(Number(room.current_bank_sc ?? 0));
  const oldBankerId = String(room.banker_id ?? "");

  if (oldBankerId === userId) {
    return NextResponse.json({ message: "You are already the banker" }, { status: 400 });
  }

  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < bank) {
    return NextResponse.json({ message: "Insufficient GPay Coins to cover the bank" }, { status: 400 });
  }

  const debitRef = `celo_banker_accept_${roomId}_${userId}`;
  const debit = await debitGpayCoins(userId, bank, "C-Lo become banker (cover bank)", debitRef, "celo_bank_cover");
  if (!debit.success) {
    return NextResponse.json({ message: debit.message ?? "Debit failed" }, { status: 400 });
  }

  await supabase.from("celo_room_players").update({ role: "player" }).eq("room_id", roomId).eq("user_id", oldBankerId);

  await supabase.from("celo_room_players").update({ role: "banker", seat_number: 0 }).eq("room_id", roomId).eq("user_id", userId);

  await supabase
    .from("celo_rooms")
    .update({
      banker_id: userId,
      last_activity: new Date().toISOString(),
    })
    .eq("id", roomId);

  await supabase
    .from("celo_rounds")
    .update({
      player_celo_offer: false,
      player_celo_expires_at: null,
    })
    .eq("id", roundId);

  const { data: roomAfter } = await supabase.from("celo_rooms").select("*").eq("id", roomId).single();

  return NextResponse.json({
    ok: true,
    room: normalizeCeloRoomRow(roomAfter as Record<string, unknown>),
    gpayCoins: (await getUserCoins(userId)).gpayCoins,
  });
}
