import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { normalizeCeloUserId } from "@/lib/celo-player-state";
import { realDiceTripletFromUnknown } from "@/lib/celo-room-dice";
import { isRoomPauseBlockingActions } from "@/lib/celo-pause";

async function nextAvailablePlayerSeat(
  admin: SupabaseClient,
  roomId: string,
  maxPlayers: number
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
  const cap = Math.max(2, Math.min(99, maxPlayers || 10));
  for (let s = 1; s < cap; s += 1) {
    if (!used.has(s)) return s;
  }
  return 1;
}

/**
 * C-Lo: after a player hits 4-5-6, they can take banker for the next round (optional).
 * Body: { room_id, round_id, accept: boolean }
 */
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

  let body: { room_id?: string; round_id?: string; accept?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "").trim();
  const roundId = String(body.round_id ?? "").trim();
  const accept = body.accept === true;
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  if (!roundId) {
    return NextResponse.json({ error: "round_id required" }, { status: 400 });
  }

  const { data: room, error: rErr } = await admin
    .from("celo_rooms")
    .select("id, banker_id, max_players, paused_at")
    .eq("id", roomId)
    .maybeSingle();
  if (rErr || !room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (isRoomPauseBlockingActions(room as { paused_at?: string | null })) {
    return NextResponse.json({ error: "Room is paused" }, { status: 400 });
  }
  const rawBanker = (room as { banker_id: string | null }).banker_id;
  if (rawBanker == null || String(rawBanker).trim() === "") {
    return NextResponse.json(
      { error: "This table has no banker to replace" },
      { status: 400 }
    );
  }
  const roomBankerId = String(rawBanker);

  const { data: round, error: roundErr } = await admin
    .from("celo_rounds")
    .select("id, room_id, player_celo_offer, player_celo_expires_at")
    .eq("id", roundId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (roundErr || !round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (!round.player_celo_offer) {
    return NextResponse.json({ error: "No C-Lo banker offer on this round" }, { status: 400 });
  }
  const exp = round.player_celo_expires_at
    ? new Date(String(round.player_celo_expires_at))
    : null;
  if (exp && exp < new Date()) {
    return NextResponse.json({ error: "Banker offer expired" }, { status: 400 });
  }

  const { data: pr, error: prErr } = await admin
    .from("celo_player_rolls")
    .select("dice, user_id")
    .eq("round_id", roundId)
    .eq("user_id", userId)
    .in("outcome", ["win"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prErr || !pr) {
    return NextResponse.json(
      { error: "Only the winning C-Lo roller can use this offer" },
      { status: 403 }
    );
  }
  const trip = realDiceTripletFromUnknown(pr.dice);
  if (!trip) {
    return NextResponse.json({ error: "C-Lo roll not found" }, { status: 400 });
  }
  const s = [trip[0], trip[1], trip[2]].sort((a, b) => a - b);
  if (s[0] !== 4 || s[1] !== 5 || s[2] !== 6) {
    return NextResponse.json({ error: "C-Lo 4-5-6 not found for this user/round" }, { status: 400 });
  }

  if (!accept) {
    await admin
      .from("celo_rounds")
      .update({ player_celo_offer: false, player_celo_expires_at: null })
      .eq("id", roundId);
    return NextResponse.json({ ok: true as const, accepted: false });
  }

  if (normalizeCeloUserId(roomBankerId) === normalizeCeloUserId(userId)) {
    return NextResponse.json({ error: "You are already the banker" }, { status: 400 });
  }

  const maxPlayers = Math.floor(
    Number((room as { max_players?: number }).max_players) || 10
  );
  const nextSeat = await nextAvailablePlayerSeat(admin, roomId, maxPlayers);

  await admin
    .from("celo_rooms")
    .update({ banker_id: userId, bank_busted: false })
    .eq("id", roomId);
  await admin
    .from("celo_room_players")
    .update({ role: "player", seat_number: nextSeat })
    .eq("room_id", roomId)
    .eq("user_id", roomBankerId);
  await admin
    .from("celo_room_players")
    .update({ role: "banker", seat_number: 0 })
    .eq("room_id", roomId)
    .eq("user_id", userId);
  await admin
    .from("celo_rounds")
    .update({ player_celo_offer: false, player_celo_expires_at: null })
    .eq("id", roundId);

  const { data: roomOut } = await admin
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  return NextResponse.json({ ok: true as const, accepted: true, room: roomOut });
}
