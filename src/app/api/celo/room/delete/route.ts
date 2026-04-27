import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { normalizeCeloUserId } from "@/lib/celo-player-state";

/**
 * Banker-only: remove a C-Lo room and dependent rows. Body: { roomId }.
 * Auth: same Bearer / cookie pattern as other C-Lo routes.
 */
export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ ok: false as const, error: "Server is not configured" }, { status: 500 });
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
    return NextResponse.json({ ok: false as const, error: "Request body is not valid JSON" }, { status: 400 });
  }
  const roomId = String(body.roomId ?? "").trim();
  if (!roomId) {
    return NextResponse.json({ ok: false as const, error: "roomId is required" }, { status: 400 });
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
    return NextResponse.json(
      { ok: false as const, error: "Only the room banker can delete this room" },
      { status: 403 }
    );
  }

  const roomStatus = String((roomRow as { status?: string }).status ?? "");
  if (roomStatus === "rolling") {
    return NextResponse.json(
      { ok: false as const, error: "Cannot delete this room while a round is in progress" },
      { status: 400 }
    );
  }

  const { data: stakedPlayerRows, error: stakeErr } = await adminClient
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("role", "player")
    .eq("entry_posted", true)
    .gt("stake_amount_sc", 0)
    .limit(1);

  if (stakeErr) {
    console.error("[C-Lo room/delete] staked entry check", stakeErr);
    return NextResponse.json(
      { ok: false as const, error: "Could not verify table players before delete" },
      { status: 500 }
    );
  }
  if (stakedPlayerRows && stakedPlayerRows.length > 0) {
    return NextResponse.json(
      {
        ok: false as const,
        error:
          "Cannot delete this room while a player has a posted entry with a stake. Wait until stakes are cleared.",
      },
      { status: 400 }
    );
  }

  const { error: dRolls } = await adminClient.from("celo_player_rolls").delete().eq("room_id", roomId);
  if (dRolls) {
    console.error("[C-Lo room/delete] celo_player_rolls", dRolls);
    return NextResponse.json(
      { ok: false as const, error: "Could not remove roll history for this room" },
      { status: 500 }
    );
  }

  const { error: dRounds } = await adminClient.from("celo_rounds").delete().eq("room_id", roomId);
  if (dRounds) {
    console.error("[C-Lo room/delete] celo_rounds", dRounds);
    return NextResponse.json(
      { ok: false as const, error: "Could not remove rounds for this room" },
      { status: 500 }
    );
  }

  const { error: dSideBets } = await adminClient.from("celo_side_bets").delete().eq("room_id", roomId);
  if (dSideBets) {
    console.error("[C-Lo room/delete] celo_side_bets", dSideBets);
    return NextResponse.json(
      { ok: false as const, error: "Could not remove side bets for this room" },
      { status: 500 }
    );
  }

  const { error: dChat } = await adminClient.from("celo_chat").delete().eq("room_id", roomId);
  if (dChat) {
    console.error("[C-Lo room/delete] celo_chat", dChat);
    return NextResponse.json(
      { ok: false as const, error: "Could not remove chat for this room" },
      { status: 500 }
    );
  }

  const { error: dPlayers } = await adminClient.from("celo_room_players").delete().eq("room_id", roomId);
  if (dPlayers) {
    console.error("[C-Lo room/delete] celo_room_players", dPlayers);
    return NextResponse.json(
      { ok: false as const, error: "Could not remove players at this table" },
      { status: 500 }
    );
  }

  const { error: dRoom } = await adminClient.from("celo_rooms").delete().eq("id", roomId);
  if (dRoom) {
    console.error("[C-Lo room/delete] celo_rooms", dRoom);
    return NextResponse.json(
      { ok: false as const, error: "Could not remove the room record" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true as const });
}
