import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  if (!roomId) return NextResponse.json({ message: "room_id required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: roomRaw, error: rErr } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();
  if (rErr || !roomRaw) return NextResponse.json({ message: "Room not found" }, { status: 404 });

  const room = roomRaw as Record<string, unknown>;
  if (String(room.banker_id) !== userId) {
    return NextResponse.json({ message: "Only the banker can start a round" }, { status: 403 });
  }

  const { data: players } = await supabase
    .from("celo_room_players")
    .select("user_id, entry_sc, seat_number, role")
    .eq("room_id", roomId)
    .eq("role", "player");

  const withEntry = (players ?? []).filter((p) => Number((p as { entry_sc?: number }).entry_sc) > 0);
  if (withEntry.length < 1) {
    return NextResponse.json({ message: "At least one player with an entry is required" }, { status: 400 });
  }

  const { data: openRows } = await supabase
    .from("celo_rounds")
    .select("id")
    .eq("room_id", roomId)
    .neq("status", "completed")
    .limit(1);

  if (openRows && openRows.length > 0) {
    return NextResponse.json({ message: "A round is already in progress" }, { status: 400 });
  }

  const prizePool = withEntry.reduce((s, p) => s + Math.floor(Number((p as { entry_sc?: number }).entry_sc ?? 0)), 0);
  const platformFee = Math.floor((prizePool * 10) / 100);

  const { data: lastNum } = await supabase
    .from("celo_rounds")
    .select("round_number")
    .eq("room_id", roomId)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextRound = Math.floor(Number((lastNum as { round_number?: number } | null)?.round_number ?? 0)) + 1;

  const seats = withEntry.map((p) => Number((p as { seat_number?: number }).seat_number)).filter((n) => Number.isFinite(n));
  const currentSeat = seats.length ? Math.min(...seats) : 1;

  const { data: inserted, error: insErr } = await supabase
    .from("celo_rounds")
    .insert({
      room_id: roomId,
      round_number: nextRound,
      banker_id: String(room.banker_id),
      status: "banker_rolling",
      prize_pool_sc: prizePool,
      platform_fee_sc: platformFee,
      banker_dice: null,
      banker_dice_name: null,
      banker_dice_result: null,
      current_player_seat: currentSeat,
      player_celo_offer: false,
      player_celo_expires_at: null,
      roll_processing: false,
    })
    .select("*")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ message: insErr?.message ?? "Failed to start round" }, { status: 500 });
  }

  await supabase.from("celo_rooms").update({ status: "rolling", last_activity: new Date().toISOString() }).eq("id", roomId);

  return NextResponse.json({ ok: true, round: inserted });
}
