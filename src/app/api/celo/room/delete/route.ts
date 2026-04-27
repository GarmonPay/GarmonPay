import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { normalizeCeloUserId } from "@/lib/celo-player-state";

const ACTIVE_ROOM = "rolling";
const IN_PROGRESS_ROUNDS = ["banker_rolling", "player_rolling", "betting"] as const;

/**
 * Banker-only: remove a C-Lo room and dependent rows. Body: { roomId }.
 */
export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ ok: false as const, error: "Server not configured" }, { status: 500 });
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return celoUnauthorizedJsonResponse();
  }
  const { user, adminClient } = auth;
  const userId = user.id;

  let body: { roomId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false as const, error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.roomId ?? "").trim();
  if (!roomId) {
    return NextResponse.json({ ok: false as const, error: "roomId required" }, { status: 400 });
  }

  const { data: roomRow, error: roomErr } = await adminClient
    .from("celo_rooms")
    .select("id, banker_id, status")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !roomRow) {
    return NextResponse.json({ ok: false as const, error: "Room not found" }, { status: 404 });
  }

  const bankerId = (roomRow as { banker_id?: string | null }).banker_id;
  if (bankerId == null || normalizeCeloUserId(bankerId) !== normalizeCeloUserId(userId)) {
    return NextResponse.json({ ok: false as const, error: "Only the room banker can delete this room" }, { status: 403 });
  }

  const roomStatus = String((roomRow as { status?: string }).status ?? "");
  if (roomStatus === ACTIVE_ROOM) {
    return NextResponse.json({ ok: false as const, error: "Cannot delete active room" }, { status: 400 });
  }

  const { data: inProgress, error: roundErr } = await adminClient
    .from("celo_rounds")
    .select("id")
    .eq("room_id", roomId)
    .in("status", [...IN_PROGRESS_ROUNDS])
    .limit(1);
  if (roundErr) {
    console.error("[C-Lo room/delete] in-progress round check", roundErr);
    return NextResponse.json({ ok: false as const, error: "Cannot delete active room" }, { status: 500 });
  }
  if (inProgress && inProgress.length > 0) {
    return NextResponse.json({ ok: false as const, error: "Cannot delete active room" }, { status: 400 });
  }

  const { data: postedRows, error: entryErr } = await adminClient
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("entry_posted", true)
    .limit(1);
  if (entryErr) {
    console.error("[C-Lo room/delete] entry_posted check", entryErr);
    return NextResponse.json({ ok: false as const, error: "Cannot delete active room" }, { status: 500 });
  }
  if (postedRows && postedRows.length > 0) {
    return NextResponse.json({ ok: false as const, error: "Cannot delete active room" }, { status: 400 });
  }

  const { error: dRolls } = await adminClient.from("celo_player_rolls").delete().eq("room_id", roomId);
  if (dRolls) {
    console.error("[C-Lo room/delete] celo_player_rolls", dRolls);
    return NextResponse.json({ ok: false as const, error: "Could not delete room" }, { status: 500 });
  }

  const { error: dRounds } = await adminClient.from("celo_rounds").delete().eq("room_id", roomId);
  if (dRounds) {
    console.error("[C-Lo room/delete] celo_rounds", dRounds);
    return NextResponse.json({ ok: false as const, error: "Could not delete room" }, { status: 500 });
  }

  const { error: dPlayers } = await adminClient.from("celo_room_players").delete().eq("room_id", roomId);
  if (dPlayers) {
    console.error("[C-Lo room/delete] celo_room_players", dPlayers);
    return NextResponse.json({ ok: false as const, error: "Could not delete room" }, { status: 500 });
  }

  const { error: dRoom } = await adminClient.from("celo_rooms").delete().eq("id", roomId);
  if (dRoom) {
    console.error("[C-Lo room/delete] celo_rooms", dRoom);
    return NextResponse.json({ ok: false as const, error: "Could not delete room" }, { status: 500 });
  }

  return NextResponse.json({ ok: true as const });
}
