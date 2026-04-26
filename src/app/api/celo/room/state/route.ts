import { NextResponse } from "next/server";
import { getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import {
  CELO_ROOM_PLAYERS_USER_EMBED,
  shapeCeloRoomStatePlayer,
} from "@/lib/celo-player-state";

const PLAYER_SELECT = `*,${CELO_ROOM_PLAYERS_USER_EMBED}`;

function isActiveRoundStatus(status: string): boolean {
  return status === "banker_rolling" || status === "player_rolling" || status === "betting";
}

/**
 * Authoritative room snapshot (service role): room, players, active round, recent rolls.
 * Used by the room page fetchAll so UI matches server state even when client RLS lags.
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
    .select("*")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomRaw as { id: string; banker_id: string; room_type: string | null; status: string };
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

  const { data: players, error: pErr } = await adminClient
    .from("celo_room_players")
    .select(PLAYER_SELECT)
    .eq("room_id", roomId)
    .order("seat_number", { ascending: true });

  if (pErr) {
    return NextResponse.json(
      { error: pErr.message ?? "Failed to load players" },
      { status: 500 }
    );
  }

  let { data: activeRound } = await adminClient
    .from("celo_rounds")
    .select("*")
    .eq("room_id", roomId)
    .in("status", ["banker_rolling", "player_rolling", "betting"])
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const roomStatus = String(room.status ?? "");
  if (!activeRound && (roomStatus === "rolling" || roomStatus === "active")) {
    const { data: repaired } = await adminClient
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const st = String((repaired as { status?: string } | null)?.status ?? "");
    if (repaired && isActiveRoundStatus(st)) {
      activeRound = repaired;
    }
  }

  const roundId = activeRound && (activeRound as { id?: string }).id ? String((activeRound as { id: string }).id) : null;

  let playerRolls: unknown[] = [];
  if (roundId) {
    const { data: rolls } = await adminClient
      .from("celo_player_rolls")
      .select("id, round_id, room_id, user_id, dice, outcome, created_at")
      .eq("round_id", roundId)
      .order("created_at", { ascending: false })
      .limit(30);
    playerRolls = rolls ?? [];
  }

  const bankerIdForShape = String(
    (roomRaw as { banker_id?: string | null }).banker_id ?? ""
  );
  const playersShaped = (players ?? []).map((raw) =>
    shapeCeloRoomStatePlayer(raw as Record<string, unknown>, bankerIdForShape || null)
  );

  return NextResponse.json({
    room: roomRaw,
    players: playersShaped,
    activeRound: activeRound ?? null,
    playerRolls,
  });
}
