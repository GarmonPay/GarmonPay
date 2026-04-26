import { NextResponse } from "next/server";
import { getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { normalizeCeloUserId } from "@/lib/celo-player-state";

/**
 * Banker opens the entry phase immediately (players may join/post after).
 * Round row is created later via POST /api/celo/round/begin-rolls.
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
  let body: { room_id?: string };
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
  const room = roomRaw as { banker_id: string; id: string; status: string };
  if (normalizeCeloUserId(room.banker_id) !== normalizeCeloUserId(userId)) {
    return NextResponse.json(
      { error: "Only the banker can start a round" },
      { status: 403 }
    );
  }
  if (String(room.status) !== "waiting") {
    return NextResponse.json(
      { error: "The room is not ready to open entries (must be waiting)" },
      { status: 400 }
    );
  }
  const { data: active } = await adminClient
    .from("celo_rounds")
    .select("id, status")
    .eq("room_id", roomId)
    .in("status", ["banker_rolling", "player_rolling", "betting"])
    .limit(1);
  if (active && active.length > 0) {
    return NextResponse.json(
      { error: "A round is already in progress" },
      { status: 400 }
    );
  }
  const { data: roomAfter, error: upErr } = await adminClient
    .from("celo_rooms")
    .update({
      status: "entry_phase",
      last_activity: new Date().toISOString(),
    })
    .eq("id", roomId)
    .select("*")
    .single();
  if (upErr || !roomAfter) {
    return NextResponse.json(
      { error: upErr?.message ?? "Could not update room" },
      { status: 500 }
    );
  }
  return NextResponse.json({ room: roomAfter });
}
