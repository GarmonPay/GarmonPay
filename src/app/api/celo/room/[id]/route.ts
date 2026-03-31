import { NextResponse } from "next/server";
import { getCeloUserId, admin } from "@/lib/celo-server";

/** GET — room detail with players and active round. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCeloUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: roomId } = await params;
    if (!roomId) {
      return NextResponse.json({ error: "Missing room id" }, { status: 400 });
    }

    const supabase = admin();

    const { data: room, error: roomErr } = await supabase
      .from("celo_rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("celo_room_players")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();

    const isPrivate = (room as { room_type: string }).room_type === "private";
    const isMember = !!membership;
    const isCreatorOrBanker =
      userId === (room as { creator_id: string }).creator_id ||
      userId === (room as { banker_id: string | null }).banker_id;

    if (isPrivate && !isMember && !isCreatorOrBanker) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: players } = await supabase
      .from("celo_room_players")
      .select("user_id, role, bet_cents, seat_number, joined_at")
      .eq("room_id", roomId)
      .order("seat_number", { ascending: true });

    const { data: activeRound } = await supabase
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .in("status", ["betting", "banker_rolling", "player_rolling"])
      .maybeSingle();

    let playerRolls: unknown[] = [];
    if (activeRound) {
      const { data: rolls } = await supabase
        .from("celo_player_rolls")
        .select("user_id, dice, roll_name, roll_result, point, outcome, bet_cents, created_at")
        .eq("round_id", (activeRound as { id: string }).id)
        .order("created_at", { ascending: true });
      playerRolls = rolls ?? [];
    }

    return NextResponse.json({
      room,
      players: players ?? [],
      active_round: activeRound,
      player_rolls: playerRolls,
      you: { user_id: userId, role: membership?.role ?? null },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
