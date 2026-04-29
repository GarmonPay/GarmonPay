import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { normalizeCeloUserId } from "@/lib/celo-player-state";
import {
  CELO_PAUSE_DURATION_MS,
  canBankerInitiatePause,
  fetchLatestRoundForPause,
} from "@/lib/celo-pause";

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

  let body: { room_id?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "").trim();
  const reason =
    typeof body.reason === "string" ? body.reason.slice(0, 500) : null;
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

  const room = roomRaw as {
    id: string;
    banker_id: string | null;
    status: string;
    paused_at?: string | null;
  };

  if (room.paused_at) {
    return NextResponse.json({ error: "Room is already paused" }, { status: 400 });
  }

  if (!room.banker_id || normalizeCeloUserId(room.banker_id) !== normalizeCeloUserId(userId)) {
    return NextResponse.json(
      { error: "Only the banker can pause from this endpoint; players use pause votes." },
      { status: 403 }
    );
  }

  const latestRound = await fetchLatestRoundForPause(admin, roomId);
  const chk = canBankerInitiatePause(room, latestRound);
  if (!chk.ok) {
    return NextResponse.json(
      { error: "Cannot pause right now", reason: chk.reason },
      { status: 400 }
    );
  }

  const now = Date.now();
  const expires = new Date(now + CELO_PAUSE_DURATION_MS).toISOString();

  await admin.from("celo_pause_votes").delete().eq("room_id", roomId);

  const { data: updated, error: uErr } = await admin
    .from("celo_rooms")
    .update({
      paused_at: new Date(now).toISOString(),
      paused_by: userId,
      pause_reason: reason,
      pause_expires_at: expires,
      last_activity: new Date(now).toISOString(),
    })
    .eq("id", roomId)
    .select("*")
    .maybeSingle();

  if (uErr || !updated) {
    return NextResponse.json(
      { error: uErr?.message ?? "Could not pause room" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, room: updated });
}
