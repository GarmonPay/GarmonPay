import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { debitGpayCoins } from "@/lib/coins";

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
  let body: { room_id?: string; round_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "");
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  const { data: p } = await adminClient
    .from("celo_room_players")
    .select("role, user_id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!p || p.role !== "player") {
    return NextResponse.json(
      { error: "Only a seated player can take the bank" },
      { status: 400 }
    );
  }
  const { data: roomRaw } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  if (!roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomRaw as { banker_id: string; current_bank_sc: number; id: string };
  const oldBankerId = room.banker_id;
  const round = body.round_id
    ? (
        await adminClient
          .from("celo_rounds")
          .select("*")
          .eq("id", String(body.round_id))
          .eq("room_id", roomId)
          .maybeSingle()
      ).data
    : (
        await adminClient
          .from("celo_rounds")
          .select("*")
          .eq("room_id", roomId)
          .order("round_number", { ascending: false })
          .limit(1)
      ).data?.[0] ?? null;
  if (!round) {
    return NextResponse.json({ error: "No round found" }, { status: 400 });
  }
  const r = round;
  if (!r.player_celo_offer) {
    return NextResponse.json(
      { error: "No open offer to take the bank" },
      { status: 400 }
    );
  }
  const exp = r.player_celo_expires_at
    ? new Date(String(r.player_celo_expires_at)).getTime()
    : 0;
  if (Date.now() > exp) {
    return NextResponse.json(
      { error: "The become-banker offer has expired" },
      { status: 400 }
    );
  }
  const bank = Math.max(0, room.current_bank_sc);
  const debit = await debitGpayCoins(
    userId,
    bank,
    "C-Lo take the bank (cover bank)",
    `celo_banker_accept_${roomId}_${userId}`,
    "celo_bank_cover"
  );
  if (!debit.success) {
    return NextResponse.json(
      { error: debit.message ?? "Insufficient balance" },
      { status: 400 }
    );
  }
  await adminClient
    .from("celo_room_players")
    .update({ role: "player" })
    .eq("room_id", roomId)
    .eq("user_id", oldBankerId);
  await adminClient
    .from("celo_room_players")
    .update({ role: "banker", seat_number: 0 })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  await adminClient
    .from("celo_rooms")
    .update({ banker_id: userId })
    .eq("id", roomId);
  await adminClient
    .from("celo_rounds")
    .update({
      player_celo_offer: false,
      player_celo_expires_at: null,
    })
    .eq("id", r.id);
  const { data: roomAfter } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  return NextResponse.json({ room: roomAfter });
}
