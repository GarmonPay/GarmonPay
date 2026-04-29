import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { normalizeCeloUserId } from "@/lib/celo-player-state";

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

  let body: { room_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "").trim();
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const { data: roomRaw, error: rErr } = await admin
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (rErr || !roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const room = roomRaw as { banker_id: string | null; paused_at?: string | null };

  if (!room.paused_at) {
    return NextResponse.json({ error: "Room is not paused" }, { status: 400 });
  }

  if (
    !room.banker_id ||
    normalizeCeloUserId(room.banker_id) !== normalizeCeloUserId(userId)
  ) {
    return NextResponse.json(
      { error: "Only the banker can resume the room" },
      { status: 403 }
    );
  }

  await admin.from("celo_pause_votes").delete().eq("room_id", roomId);

  const { data: updated, error: uErr } = await admin
    .from("celo_rooms")
    .update({
      paused_at: null,
      paused_by: null,
      pause_reason: null,
      pause_expires_at: null,
      last_activity: new Date().toISOString(),
    })
    .eq("id", roomId)
    .select("*")
    .maybeSingle();

  if (uErr || !updated) {
    return NextResponse.json(
      { error: uErr?.message ?? "Could not resume room" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, room: updated });
}
