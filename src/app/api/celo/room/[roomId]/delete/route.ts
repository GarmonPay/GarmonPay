import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { celoBankRefundReference } from "@/lib/celo-room-refund-refs";
import { walletLedgerGameWinIdempotent } from "@/lib/celo-wallet-idempotent";
import { celoQaLog } from "@/lib/celo-qa-log";
import { isRoomEmptyForDelete } from "@/lib/celo-room-rules";

/**
 * Banker: delete when no players hold table stakes, no active round, and bank is refunded (idempotent).
 * Clears celo_audit_log for the room before delete (FK); migration CASCADE too.
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
  const creatorId = String(rawRoom.creator_id ?? "");
  const isBanker = !!bankerId && bankerId === String(userId);
  const isCreator = !!creatorId && creatorId === String(userId);
  if (!isBanker && !isCreator) {
    celoQaLog("delete_room_rejected", { roomId, userId, reason: "not_banker_or_creator" });
    return NextResponse.json({ error: "Only the banker or room creator can delete this room" }, { status: 403 });
  }

  if (isCreator && !isBanker && bankerId && String(bankerId) !== String(userId)) {
    celoQaLog("delete_room_rejected", { roomId, userId, reason: "creator_cannot_delete_bankers_room" });
    return NextResponse.json(
      { error: "Only the banker can delete this room while a banker is seated" },
      { status: 403 }
    );
  }

  const empty = await isRoomEmptyForDelete(supabase, roomId);
  if (!empty.ok) {
    celoQaLog("delete_room_rejected", {
      roomId,
      userId,
      reason: empty.reason,
      playersWithStake: empty.playersWithStake,
    });
    return NextResponse.json(
      {
        error: "Cannot delete while players still have money on the table",
        details: `${empty.playersWithStake} seated player(s) still have stakes`,
      },
      { status: 400 }
    );
  }

  const { data: activeRound } = await supabase
    .from("celo_rounds")
    .select("id")
    .eq("room_id", roomId)
    .neq("status", "completed")
    .maybeSingle();

  if (activeRound) {
    celoQaLog("delete_room_rejected", {
      roomId,
      userId,
      reason: "active_round",
      roundId: (activeRound as { id?: string }).id,
    });
    return NextResponse.json({ error: "Cannot delete while a round is in progress" }, { status: 400 });
  }

  const status = String(normalized?.status ?? "");
  if (status === "cancelled" || status === "completed") {
    celoQaLog("delete_room_rejected", { roomId, userId, reason: "room_already_closed", status });
    return NextResponse.json({ error: "Room is already closed" }, { status: 400 });
  }

  const bankCents = normalized?.current_bank_cents ?? 0;
  const creditUserId = bankerId || userId;
  if (bankCents > 0) {
    const bankRef = celoBankRefundReference(roomId);
    const refund = await walletLedgerGameWinIdempotent(creditUserId, bankCents, bankRef);
    if (!refund.success) {
      return NextResponse.json(
        { error: refund.message ?? "Could not refund bank balance" },
        { status: 500 }
      );
    }
    celoQaLog("room_delete_bank_refund_ok", {
      roomId,
      bankRefundedCents: bankCents,
      ledgerSkipped: "skipped" in refund && refund.skipped,
      reference: bankRef,
    });
  } else {
    celoQaLog("room_delete_no_bank_refund", { roomId, bankCents: 0 });
  }

  // Remove FK references so celo_rooms.delete succeeds (migration also uses ON DELETE CASCADE).
  const { error: auditDelErr } = await supabase.from("celo_audit_log").delete().eq("room_id", roomId);
  if (auditDelErr) {
    return NextResponse.json(
      { error: auditDelErr.message ?? "Could not clear room audit log" },
      { status: 500 }
    );
  }

  const { error: delErr } = await supabase.from("celo_rooms").delete().eq("id", roomId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message ?? "Failed to delete room" }, { status: 500 });
  }

  await supabase.from("celo_audit_log").insert({
    room_id: null,
    user_id: userId,
    action: "room_deleted",
    details: { room_id: roomId, bank_refunded_cents: bankCents },
  });

  return NextResponse.json({ ok: true });
}
