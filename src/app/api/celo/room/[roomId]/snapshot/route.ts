import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";

/**
 * Authoritative room + player list (service role).
 * Fixes client-side RLS / PostgREST embed edge cases where the UI missed rows.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const userId = await getAuthUserIdBearerOrCookie(_req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: roomRows, error: roomErr } = await supabase
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .limit(1);
  const roomRow = celoFirstRow(roomRows);

  if (roomErr || !roomRow) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rawRoom = roomRow as Record<string, unknown>;
  const isPublic = rawRoom.room_type === "public";
  const isBanker = String(rawRoom.banker_id ?? "") === userId;

  const { data: membershipRows } = await supabase
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .limit(1);

  const membership = celoFirstRow(membershipRows);
  if (!isPublic && !isBanker && !membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: players, error: playersErr } = await supabase
    .from("celo_room_players")
    .select(
      `
      *,
      users (
        id,
        full_name,
        email
      )
    `
    )
    .eq("room_id", roomId)
    .order("seat_number", { ascending: true });

  if (playersErr) {
    return NextResponse.json({ error: playersErr.message ?? "Failed to load players" }, { status: 500 });
  }

  const { data: openRoundRows } = await supabase
    .from("celo_rounds")
    .select("*")
    .eq("room_id", roomId)
    .neq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);

  const openRound = celoFirstRow(openRoundRows);
  const openRoundId = openRound ? String((openRound as { id?: string }).id ?? "") : "";

  let latestPlayerRoll: Record<string, unknown> | null = null;
  if (openRoundId) {
    const { data: prRows } = await supabase
      .from("celo_player_rolls")
      .select("*")
      .eq("round_id", openRoundId)
      .order("created_at", { ascending: false })
      .limit(1);
    latestPlayerRoll = (celoFirstRow(prRows) as Record<string, unknown> | null) ?? null;
  }

  const { data: chatRows, error: chatErr } = await supabase
    .from("celo_chat")
    .select(
      `
      id,
      user_id,
      message,
      created_at,
      users (
        full_name,
        email
      )
    `,
    )
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (chatErr) {
    console.error("[celo/snapshot] chat load", chatErr.message);
  }

  const chatMessages = (chatRows ?? []).map((row: Record<string, unknown>) => {
    const users = row.users as { full_name?: string | null; email?: string | null } | null | undefined;
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      message: String(row.message ?? ""),
      is_system: false,
      created_at: String(row.created_at ?? ""),
      user_name: users?.full_name?.trim() || users?.email?.split("@")[0] || "Player",
    };
  });

  return NextResponse.json({
    room: rawRoom,
    players: players ?? [],
    round: openRound ?? null,
    latest_player_roll: latestPlayerRoll,
    chat: chatMessages,
  });
}
