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
  let body: { room_id?: string; new_bank_sc?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const roomId = String(body.room_id ?? "");
  const newBank = Math.floor(Number(body.new_bank_sc ?? 0));
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }
  const { data: roomRaw } = await adminClient
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .single();
  if (!roomRaw) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  const room = roomRaw as {
    banker_id: string;
    last_round_was_celo: boolean;
    banker_celo_at: string | null;
    current_bank_sc: number;
    minimum_entry_sc: number | null;
    min_bet_cents: number | null;
  };
  if (room.banker_id !== userId) {
    return NextResponse.json(
      { error: "Only the banker can lower the bank" },
      { status: 403 }
    );
  }
  if (!room.last_round_was_celo || !room.banker_celo_at) {
    return NextResponse.json(
      { error: "Lower bank is only available after a C-Lo roll" },
      { status: 400 }
    );
  }
  const t = new Date(String(room.banker_celo_at)).getTime();
  if (Date.now() - t > 60_000) {
    return NextResponse.json(
      { error: "The lower-bank window has expired" },
      { status: 400 }
    );
  }
  const minE =
    Math.max(500, room.minimum_entry_sc ?? room.min_bet_cents ?? 500);
  if (newBank >= room.current_bank_sc) {
    return NextResponse.json(
      { error: "New bank must be less than current bank" },
      { status: 400 }
    );
  }
  if (newBank < minE) {
    return NextResponse.json(
      { error: "Bank must stay at or above the minimum entry" },
      { status: 400 }
    );
  }
  if (newBank % minE !== 0) {
    return NextResponse.json(
      { error: "Bank must be a multiple of the minimum entry" },
      { status: 400 }
    );
  }
  const { data: updated, error } = await adminClient
    .from("celo_rooms")
    .update({
      current_bank_sc: newBank,
      last_round_was_celo: false,
    })
    .eq("id", roomId)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ room: updated });
}
