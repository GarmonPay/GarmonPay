import { NextResponse } from "next/server";
import { getCeloUserId, admin } from "@/lib/celo-server";

/** GET — list public C-Lo rooms (lobby). */
export async function GET(request: Request) {
  try {
    const userId = await getCeloUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = admin();
    const { searchParams } = new URL(request.url);
    const includeMine = searchParams.get("include_mine") === "1";

    const { data: rooms, error } = await supabase
      .from("celo_rooms")
      .select(
        "id, name, status, room_type, max_players, min_bet_cents, max_bet_cents, speed, join_code, banker_id, created_at, last_activity"
      )
      .eq("room_type", "public")
      .in("status", ["waiting", "active", "rolling"])
      .order("last_activity", { ascending: false })
      .limit(40);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const roomIds = (rooms ?? []).map((r) => (r as { id: string }).id);
    let countMap = new Map<string, number>();
    if (roomIds.length > 0) {
      const { data: counts } = await supabase
        .from("celo_room_players")
        .select("room_id")
        .in("room_id", roomIds)
        .eq("role", "player");
      for (const row of counts ?? []) {
        const rid = (row as { room_id: string }).room_id;
        countMap.set(rid, (countMap.get(rid) ?? 0) + 1);
      }
    }

    const enriched = (rooms ?? []).map((r) => {
      const row = r as { id: string; max_players: number };
      return {
        ...row,
        player_count: countMap.get(row.id) ?? 0,
      };
    });

    let myRooms: unknown[] = [];
    if (includeMine) {
      const { data: mine } = await supabase
        .from("celo_rooms")
        .select(
          "id, name, status, room_type, join_code, banker_id, max_players, min_bet_cents, max_bet_cents, last_activity"
        )
        .or(`banker_id.eq.${userId},creator_id.eq.${userId}`)
        .in("status", ["waiting", "active", "rolling"])
        .limit(20);
      myRooms = mine ?? [];
    }

    return NextResponse.json({ rooms: enriched, my_rooms: myRooms });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
