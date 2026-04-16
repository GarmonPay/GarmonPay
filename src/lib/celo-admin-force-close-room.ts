import type { SupabaseClient } from "@supabase/supabase-js";
import { celoFirstRow } from "@/lib/celo-first-row";
import { mergeCeloRoomUpdate, normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { celoBankRefundReference, celoPlayerStakeRefundReference } from "@/lib/celo-room-refund-refs";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { creditGpayIdempotent } from "@/lib/coins";
import { settleCeloOpenSideBets } from "@/lib/celo-side-bets-settle";

export type AdminForceCloseCeloRoomResult =
  | {
      ok: true;
      skipped: true;
      player_refunds: 0;
      bank_refunded_cents: 0;
    }
  | {
      ok: true;
      skipped?: false;
      player_refunds: number;
      bank_refunded_cents: number;
    }
  | {
      ok: false;
      message: string;
      details?: unknown;
    };

/** Force-close one C-Lo room: side bets, delete rounds, refund stakes + bank, clear players, status cancelled. */
export async function adminForceCloseCeloRoom(
  supabase: SupabaseClient,
  roomId: string
): Promise<AdminForceCloseCeloRoomResult> {
  const { data: roomRows, error: roomErr } = await supabase
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .limit(1);
  const room = celoFirstRow(roomRows);
  if (roomErr || !room) {
    return { ok: false, message: "Room not found" };
  }

  const raw = room as Record<string, unknown>;
  const normalized = normalizeCeloRoomRow(raw);
  if (!normalized) {
    return { ok: false, message: "Room not found" };
  }

  const status = String(normalized.status ?? "");
  if (status === "cancelled" || status === "completed") {
    return { ok: true, skipped: true, player_refunds: 0, bank_refunded_cents: 0 };
  }

  const bankerId = String(raw.banker_id ?? normalized.banker_id ?? "");

  const { data: roundRows } = await supabase.from("celo_rounds").select("id").eq("room_id", roomId);
  for (const rr of roundRows ?? []) {
    const rid = String((rr as { id: string }).id);
    await settleCeloOpenSideBets(supabase, rid, roomId);
  }

  await supabase.from("celo_rounds").delete().eq("room_id", roomId);

  const { data: playerRows, error: playersErr } = await supabase
    .from("celo_room_players")
    .select("user_id, role, entry_sc, bet_cents")
    .eq("room_id", roomId);

  if (playersErr) {
    return { ok: false, message: playersErr.message, details: playersErr };
  }

  let refundsIssued = 0;
  for (const p of (playerRows ?? []) as Array<{
    user_id: string;
    role: string;
    entry_sc?: number | null;
    bet_cents?: number | null;
  }>) {
    if (p.role !== "player") continue;
    const cents = celoPlayerStakeCents(p);
    if (cents <= 0) continue;
    const ref = celoPlayerStakeRefundReference(roomId, p.user_id);
    const result = await creditGpayIdempotent(
      p.user_id,
      cents,
      "C-Lo stake refund (admin force close)",
      ref,
      "celo_refund"
    );
    if (!result.success) {
      return {
        ok: false,
        message: result.message ?? "Player refund failed",
        details: p.user_id,
      };
    }
    refundsIssued += 1;
  }

  const bankCents = Math.max(
    0,
    Math.round(
      Number(raw.current_bank_sc ?? raw.current_bank_cents ?? normalized.current_bank_cents ?? 0)
    )
  );
  if (bankCents > 0 && bankerId) {
    const bankRef = celoBankRefundReference(roomId);
    const bankResult = await creditGpayIdempotent(
      bankerId,
      bankCents,
      "C-Lo bank refund (admin force close)",
      bankRef,
      "celo_bank_refund"
    );
    if (!bankResult.success) {
      return { ok: false, message: bankResult.message ?? "Bank refund failed" };
    }
  }

  const { error: delPlayersErr } = await supabase.from("celo_room_players").delete().eq("room_id", roomId);
  if (delPlayersErr) {
    return { ok: false, message: delPlayersErr.message ?? "Failed to clear players" };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("celo_rooms")
    .update(
      mergeCeloRoomUpdate(0, {
        status: "cancelled",
        last_activity: now,
      })
    )
    .eq("id", roomId);

  if (updErr) {
    return { ok: false, message: updErr.message ?? "Failed to update room" };
  }

  await supabase.from("celo_audit_log").insert({
    room_id: roomId,
    user_id: null,
    action: "room_admin_force_closed",
    details: {
      player_refunds: refundsIssued,
      bank_refunded_cents: bankCents > 0 && bankerId ? bankCents : 0,
    },
  });

  return {
    ok: true,
    player_refunds: refundsIssued,
    bank_refunded_cents: bankCents > 0 && bankerId ? bankCents : 0,
  };
}
