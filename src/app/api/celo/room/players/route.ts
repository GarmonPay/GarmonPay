import { NextResponse } from "next/server";
import { getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { CELO_ROOM_PLAYERS_USER_EMBED } from "@/lib/celo-player-state";

const SELECT = `*,${CELO_ROOM_PLAYERS_USER_EMBED}`;

/**
 * List room players with service role (bypasses RLS). Callers are authorized if
 * they could read the room: banker, public lobby, or a seated member.
 */
export async function GET(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const auth = await getCeloAuth(request, clients);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { user, adminClient } = auth;
  const url = new URL(request.url);
  const roomId = String(url.searchParams.get("room_id") ?? "").trim();
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const { data: roomRaw, error: roomErr } = await adminClient
    .from("celo_rooms")
    .select("id, banker_id, room_type")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomRaw as { id: string; banker_id: string; room_type: string | null };
  const rt = room.room_type;
  const isPublicish = rt === "public" || rt == null;

  let allowed = isPublicish;
  if (!allowed && String(room.banker_id) === String(user.id)) {
    allowed = true;
  }
  if (!allowed) {
    const { data: member } = await adminClient
      .from("celo_room_players")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle();
    allowed = !!member;
  }

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await adminClient
    .from("celo_room_players")
    .select(SELECT)
    .eq("room_id", roomId)
    .order("seat_number", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to load players" },
      { status: 500 }
    );
  }
  return NextResponse.json({ players: data ?? [] });
}
