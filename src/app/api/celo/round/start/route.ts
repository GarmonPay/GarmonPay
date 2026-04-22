import { NextResponse } from "next/server";
import { getCeloApiClients } from "@/lib/celo-api-clients";

export async function POST(request: Request) {
  const clients = await getCeloApiClients();
  if (!clients) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  const { sessionClient, adminClient } = clients;
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
  const room = roomRaw as { banker_id: string; id: string; total_rounds?: number };
  if (room.banker_id !== userId) {
    return NextResponse.json(
      { error: "Only the banker can start a round" },
      { status: 403 }
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
  const { data: players } = await adminClient
    .from("celo_room_players")
    .select("user_id, role, entry_sc")
    .eq("room_id", roomId);
  const staked = (players ?? []).filter(
    (p) => p.role === "player" && Number(p.entry_sc) > 0
  );
  if (staked.length < 1) {
    return NextResponse.json(
      { error: "At least one player with an entry is required" },
      { status: 400 }
    );
  }
  const prizePool = staked.reduce(
    (s, p) => s + Math.max(0, Math.floor(Number(p.entry_sc) || 0)),
    0
  );
  const platformFee = Math.floor(prizePool * 0.1);
  const { count: prev } = await adminClient
    .from("celo_rounds")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);
  const roundNumber = (prev ?? 0) + 1;
  const { data: round, error: insErr } = await adminClient
    .from("celo_rounds")
    .insert({
      room_id: roomId,
      round_number: roundNumber,
      banker_id: userId,
      status: "banker_rolling",
      prize_pool_sc: prizePool,
      platform_fee_sc: platformFee,
      bank_covered: false,
    })
    .select("*")
    .single();
  if (insErr || !round) {
    return NextResponse.json(
      { error: insErr?.message ?? "Could not start round" },
      { status: 500 }
    );
  }
  await adminClient
    .from("celo_rooms")
    .update({
      status: "active",
      last_activity: new Date().toISOString(),
    })
    .eq("id", roomId);
  return NextResponse.json({ round });
}
