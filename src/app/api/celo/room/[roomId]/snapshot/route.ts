import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/**
 * Authoritative room + player list (service role).
 * Fixes client-side RLS / PostgREST embed edge cases where the UI missed rows.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const userId = await getAuthUserIdStrict(_req);
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

  const { data: roomRow, error: roomErr } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();

  if (roomErr || !roomRow) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rawRoom = roomRow as Record<string, unknown>;
  const isPublic = rawRoom.room_type === "public";
  const isBanker = String(rawRoom.banker_id ?? "") === userId;

  const { data: membership } = await supabase
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

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

  const { data: openRound } = await supabase
    .from("celo_rounds")
    .select("*")
    .eq("room_id", roomId)
    .neq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    room: rawRoom,
    players: players ?? [],
    round: openRound ?? null,
  });
}
