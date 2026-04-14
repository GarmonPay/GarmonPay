import type { SupabaseClient } from "@supabase/supabase-js";
import { celoFirstRow } from "@/lib/celo-first-row";
import { mergeCeloRoomUpdate, normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { celoBankRefundReference, celoPlayerStakeRefundReference } from "@/lib/celo-room-refund-refs";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { creditSweepsIdempotent } from "@/lib/coins";

type Admin = SupabaseClient;

/**
 * Banker/cron/system: close room, refund stakes + bank, clear players, set cancelled.
 * Does not enforce auth — caller must only invoke from trusted server routes.
 */
export async function systemCloseCeloRoomWithRefunds(
  admin: Admin,
  roomId: string,
  meta: { reason: string; auditUserId?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: roomRows, error: roomErr } = await admin
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .limit(1);
  const room = celoFirstRow(roomRows);
  if (roomErr || !room) {
    return { ok: false, error: roomErr?.message ?? "Room not found" };
  }

  const raw = room as Record<string, unknown>;
  const normalized = normalizeCeloRoomRow(raw);
  if (!normalized) {
    return { ok: false, error: "Room not found" };
  }

  const st = String(normalized.status ?? "");
  if (st === "cancelled" || st === "completed") {
    return { ok: true };
  }

  const { data: activeRound } = await admin
    .from("celo_rounds")
    .select("id")
    .eq("room_id", roomId)
    .neq("status", "completed")
    .maybeSingle();

  if (activeRound) {
    return { ok: false, error: "Round in progress" };
  }

  const { data: playerRows, error: playersErr } = await admin
    .from("celo_room_players")
    .select("user_id, role, entry_sc, bet_cents")
    .eq("room_id", roomId);

  if (playersErr) {
    return { ok: false, error: playersErr.message };
  }

  const rows = (playerRows ?? []) as Array<{
    user_id: string;
    role: string;
    entry_sc?: number | null;
    bet_cents?: number | null;
  }>;

  for (const p of rows) {
    if (p.role !== "player") continue;
    const cents = celoPlayerStakeCents(p);
    if (cents <= 0) continue;
    const ref = celoPlayerStakeRefundReference(roomId, p.user_id);
    const result = await creditSweepsIdempotent(
      p.user_id,
      cents,
      `C-Lo stake refund (${meta.reason})`,
      ref,
      "celo_refund"
    );
    if (!result.success) {
      return { ok: false, error: result.message ?? "Player refund failed" };
    }
  }

  const bankerId = String(raw.banker_id ?? normalized.banker_id ?? "");
  const bankCents = Math.max(
    0,
    Math.round(Number(raw.current_bank_sc ?? raw.current_bank_cents ?? normalized.current_bank_cents ?? 0))
  );
  /** Bank reserve is debited in SC (`debit_sweeps_coins` on create); refund SC, not USD wallet ledger. */
  if (bankCents > 0 && bankerId) {
    const bankRef = celoBankRefundReference(roomId);
    const bankResult = await creditSweepsIdempotent(
      bankerId,
      bankCents,
      `C-Lo bank refund (${meta.reason})`,
      bankRef,
      "celo_bank_refund"
    );
    if (!bankResult.success) {
      return { ok: false, error: bankResult.message ?? "Bank refund failed" };
    }
  }

  const { error: delPlayersErr } = await admin.from("celo_room_players").delete().eq("room_id", roomId);
  if (delPlayersErr) {
    return { ok: false, error: delPlayersErr.message };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await admin
    .from("celo_rooms")
    .update(
      mergeCeloRoomUpdate(0, {
        status: "cancelled",
        last_activity: now,
      })
    )
    .eq("id", roomId);

  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  const actor = meta.auditUserId ?? null;
  await admin.from("celo_audit_log").insert({
    room_id: roomId,
    user_id: actor,
    action: actor ? "room_closed" : "room_system_closed",
    details: { reason: meta.reason },
  });

  return { ok: true };
}
