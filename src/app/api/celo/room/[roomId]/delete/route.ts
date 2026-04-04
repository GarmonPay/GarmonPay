import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

/**
 * Banker-only: delete room when they are the only participant (no other players/spectators)
 * and no round is in progress. Refunds room bank balance to the banker.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ roomId: string }> }) {
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

  const { data: room, error: roomErr } = await supabase.from("celo_rooms").select("*").eq("id", roomId).maybeSingle();

  if (roomErr || !room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const rawRoom = room as Record<string, unknown>;
  const normalized = normalizeCeloRoomRow(rawRoom);
  const bankerId = String(rawRoom.banker_id ?? normalized?.banker_id ?? "");
  if (!bankerId || bankerId !== String(userId)) {
    return NextResponse.json({ error: "Only the banker can delete this room" }, { status: 403 });
  }

  const { count, error: countErr } = await supabase
    .from("celo_room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  if (countErr) {
    return NextResponse.json({ error: "Could not verify players" }, { status: 500 });
  }

  if ((count ?? 0) !== 1) {
    return NextResponse.json(
      { error: "Room can only be deleted when no one else is in the room" },
      { status: 400 }
    );
  }

  const { data: sole, error: soleErr } = await supabase
    .from("celo_room_players")
    .select("user_id, role")
    .eq("room_id", roomId)
    .single();

  if (soleErr || !sole) {
    return NextResponse.json({ error: "Could not load room membership" }, { status: 500 });
  }

  const row = sole as { user_id: string; role: string };
  if (row.role !== "banker" || String(row.user_id) !== String(userId)) {
    return NextResponse.json({ error: "Only the solo banker can delete this room" }, { status: 400 });
  }

  const { data: activeRound } = await supabase
    .from("celo_rounds")
    .select("id")
    .eq("room_id", roomId)
    .neq("status", "completed")
    .maybeSingle();

  if (activeRound) {
    return NextResponse.json({ error: "Cannot delete while a round is in progress" }, { status: 400 });
  }

  const bankCents = normalized?.current_bank_cents ?? 0;
  if (bankCents > 0) {
    const refund = await walletLedgerEntry(
      userId,
      "game_win",
      bankCents,
      `celo_room_delete_refund_${roomId}_${Date.now()}`
    );
    if (!refund.success) {
      return NextResponse.json(
        { error: refund.message ?? "Could not refund bank balance" },
        { status: 500 }
      );
    }
  }

  await supabase.from("celo_audit_log").insert({
    room_id: roomId,
    user_id: userId,
    action: "room_deleted",
    details: { bank_refunded_cents: bankCents },
  });

  const { error: delErr } = await supabase.from("celo_rooms").delete().eq("id", roomId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message ?? "Failed to delete room" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
