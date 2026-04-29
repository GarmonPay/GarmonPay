import { NextResponse } from "next/server";
import { celoUnauthorizedJsonResponse, getCeloApiClients, getCeloAuth } from "@/lib/celo-api-clients";
import { normalizeCeloUserId } from "@/lib/celo-player-state";
import {
  CELO_PAUSE_DURATION_MS,
  canPlayerInitiatePauseFlow,
  fetchLatestRoundForPause,
  majorityThreshold,
} from "@/lib/celo-pause";

function effectiveStakeSc(row: {
  stake_amount_sc?: number | null;
  entry_sc?: number | null;
  bet_cents?: number | null;
}): number {
  const sc = Math.floor(Number(row.stake_amount_sc ?? 0));
  if (sc > 0) return sc;
  return Math.floor(Number(row.entry_sc ?? row.bet_cents ?? 0));
}

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

  let body: { room_id?: string; vote?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "").trim();
  const voteRaw = String(body.vote ?? "").toLowerCase();
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  if (voteRaw !== "request" && voteRaw !== "approve") {
    return NextResponse.json({ error: "vote must be request or approve" }, { status: 400 });
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

  if (
    room.banker_id &&
    normalizeCeloUserId(room.banker_id) === normalizeCeloUserId(userId)
  ) {
    return NextResponse.json(
      { error: "Banker should use the pause endpoint" },
      { status: 403 }
    );
  }

  const { data: seat } = await admin
    .from("celo_room_players")
    .select("user_id, role, seat_number, entry_posted, stake_amount_sc, entry_sc, bet_cents")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  const pl = seat as {
    role?: string;
    seat_number?: number | null;
  } | null;
  if (!pl || String(pl.role ?? "").toLowerCase() !== "player") {
    return NextResponse.json(
      { error: "Only seated players can vote to pause" },
      { status: 403 }
    );
  }

  const latestRound = await fetchLatestRoundForPause(admin, roomId);
  const chk = canPlayerInitiatePauseFlow(room, latestRound);
  if (!chk.ok) {
    return NextResponse.json(
      { error: "Cannot pause right now", reason: chk.reason },
      { status: 400 }
    );
  }

  const { error: insErr } = await admin.from("celo_pause_votes").upsert(
    {
      room_id: roomId,
      user_id: userId,
      vote: voteRaw,
    },
    { onConflict: "room_id,user_id,vote" }
  );

  if (insErr) {
    return NextResponse.json(
      { error: insErr.message ?? "Could not record vote" },
      { status: 500 }
    );
  }

  const { data: allPlayers } = await admin
    .from("celo_room_players")
    .select("user_id, role, seat_number, entry_posted, stake_amount_sc")
    .eq("room_id", roomId);

  const bankerId = room.banker_id ? String(room.banker_id) : null;
  const eligible =
    (allPlayers ?? []).filter((p) => {
      const role = String((p as { role?: string }).role ?? "").toLowerCase();
      if (role !== "player") return false;
      const uid = String((p as { user_id?: string }).user_id ?? "");
      if (!uid || (bankerId && normalizeCeloUserId(uid) === normalizeCeloUserId(bankerId))) {
        return false;
      }
      const sn = (p as { seat_number?: number | null }).seat_number;
      const posted =
        (p as { entry_posted?: boolean }).entry_posted === true &&
        effectiveStakeSc(p as { stake_amount_sc?: number }) > 0;
      const seated = sn != null && Number(sn) >= 0;
      return posted || seated;
    }) ?? [];

  const eligibleCount = eligible.length;
  const need = majorityThreshold(eligibleCount);

  const { count: approveCount, error: cErr } = await admin
    .from("celo_pause_votes")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("vote", "approve");

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  const approvals = approveCount ?? 0;
  let roomOut = roomRaw;

  if (voteRaw === "approve" && approvals >= need && eligibleCount > 0) {
    const now = Date.now();
    const expires = new Date(now + CELO_PAUSE_DURATION_MS).toISOString();
    const { data: pausedRoom, error: pErr } = await admin
      .from("celo_rooms")
      .update({
        paused_at: new Date(now).toISOString(),
        paused_by: userId,
        pause_reason: "majority_player_vote",
        pause_expires_at: expires,
        last_activity: new Date(now).toISOString(),
      })
      .eq("id", roomId)
      .is("paused_at", null)
      .select("*")
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
    if (pausedRoom) {
      roomOut = pausedRoom;
    }
  }

  return NextResponse.json({
    ok: true,
    room: roomOut,
    voteRecorded: voteRaw,
    eligiblePlayers: eligibleCount,
    approveVotes: approvals,
    majorityRequired: need,
    pausedByMajority:
      Boolean((roomOut as { paused_at?: string | null }).paused_at) &&
      !(room as { paused_at?: string | null }).paused_at,
  });
}
