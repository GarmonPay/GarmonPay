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

  const { data: roomRaw, error: roomErr } = await admin
    .from("celo_rooms")
    .select("id, banker_id, paused_at")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const room = roomRaw as { banker_id?: string | null; paused_at?: string | null };
  if (
    !room.banker_id ||
    normalizeCeloUserId(room.banker_id) !== normalizeCeloUserId(user.id)
  ) {
    return NextResponse.json({ error: "Only banker can reject pause request" }, { status: 403 });
  }
  if (room.paused_at) {
    return NextResponse.json({ error: "Room is already paused" }, { status: 400 });
  }

  const { error: delErr } = await admin.from("celo_pause_votes").delete().eq("room_id", roomId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message ?? "Could not clear votes" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
