import type { SupabaseClient } from "@supabase/supabase-js";
import { creditGpayIdempotent, debitGpayCoins, getUserCoins } from "@/lib/coins";
import { insertCeloPlatformFee } from "@/lib/celo-platform-fee";
import { normalizeCeloUserId } from "@/lib/celo-player-state";

async function txReferenceExists(
  admin: SupabaseClient,
  reference: string
): Promise<boolean> {
  const { data } = await admin
    .from("coin_transactions")
    .select("id")
    .eq("reference", reference)
    .maybeSingle();
  return data != null;
}

const ABANDON_FEE_GPC = 500;

export function effectiveStakeSc(row: {
  stake_amount_sc?: number | null;
  entry_sc?: number | null;
  bet_cents?: number | null;
}): number {
  const sc = Math.floor(Number(row.stake_amount_sc ?? 0));
  if (sc > 0) return sc;
  return Math.floor(Number(row.entry_sc ?? row.bet_cents ?? 0));
}

async function resetRoomEntries(admin: SupabaseClient, roomId: string) {
  await admin
    .from("celo_room_players")
    .update({
      entry_sc: 0,
      bet_cents: 0,
      stake_amount_sc: 0,
      entry_posted: false,
      status: "seated",
      player_seat_status: "seated",
    })
    .eq("room_id", roomId)
    .neq("role", "banker");
}

async function debitPauseFeeIdempotent(
  admin: SupabaseClient,
  bankerId: string,
  roomId: string,
  reference: string
): Promise<{ charged: number }> {
  if (await txReferenceExists(admin, reference)) {
    return { charged: 0 };
  }
  const { gpayCoins } = await getUserCoins(bankerId);
  const charge = Math.min(ABANDON_FEE_GPC, Math.max(0, gpayCoins));
  if (charge <= 0) {
    return { charged: 0 };
  }
  const d = await debitGpayCoins(
    bankerId,
    charge,
    "C-Lo pause timeout — banker abandonment fee",
    reference,
    "celo_abandon_fee"
  );
  if (!d.success && !String(d.message ?? "").toLowerCase().includes("duplicate")) {
    console.error("[C-Lo pause cleanup] fee debit failed", { roomId, bankerId, message: d.message });
    return { charged: 0 };
  }
  return { charged: charge };
}

/**
 * Pause expired without resume: refund players, optionally fee banker (banker-initiated pause only),
 * cancel active rounds, close room.
 */
export async function processExpiredPauseRoom(
  admin: SupabaseClient,
  room: {
    id: string;
    banker_id: string | null;
    paused_by?: string | null;
  },
  nowIso: string
): Promise<{ ok: boolean; reason?: string }> {
  const roomId = String(room.id);
  const bankerId = room.banker_id ? String(room.banker_id) : null;
  if (!bankerId) {
    return { ok: false, reason: "no_banker" };
  }

  const { data: players } = await admin
    .from("celo_room_players")
    .select(
      "user_id, role, entry_posted, stake_amount_sc, entry_sc, bet_cents"
    )
    .eq("room_id", roomId);

  const postedForRefund = (players ?? []).filter((p) => {
    const role = String((p as { role?: string }).role ?? "").toLowerCase();
    if (role === "banker") return false;
    const uid = String((p as { user_id?: string }).user_id ?? "");
    if (!uid || normalizeCeloUserId(uid) === normalizeCeloUserId(bankerId)) {
      return false;
    }
    const row = p as {
      entry_posted?: boolean;
      stake_amount_sc?: number;
      entry_sc?: number;
      bet_cents?: number;
    };
    return row.entry_posted === true && effectiveStakeSc(row) > 0;
  });

  for (const pr of postedForRefund) {
    const prow = pr as {
      user_id: string;
      stake_amount_sc?: number | null;
      entry_sc?: number | null;
      bet_cents?: number | null;
    };
    const uid = String(prow.user_id);
    const amt = effectiveStakeSc(prow);
    if (amt <= 0) continue;
    const refKey = `celo_pause_timeout_refund_${roomId}_${uid}`;
    const cr = await creditGpayIdempotent(
      uid,
      amt,
      "C-Lo pause expired — entry refund",
      refKey,
      "celo_bank_refund"
    );
    if (!cr.success) {
      console.error("[C-Lo pause cleanup] refund failed", { roomId, uid, message: cr.message });
      return { ok: false, reason: "refund_failed" };
    }
  }

  await resetRoomEntries(admin, roomId);

  await admin
    .from("celo_pause_votes")
    .delete()
    .eq("room_id", roomId);

  await admin
    .from("celo_rounds")
    .update({ status: "cancelled", completed_at: nowIso })
    .eq("room_id", roomId)
    .in("status", ["banker_rolling", "player_rolling", "betting"]);

  const bankerPaused =
    room.paused_by != null &&
    normalizeCeloUserId(String(room.paused_by)) === normalizeCeloUserId(bankerId);

  let feeCharged = 0;
  if (bankerPaused && postedForRefund.length > 0) {
    const feeRef = `celo_pause_timeout_fee_${roomId}_${bankerId}`;
    const { charged } = await debitPauseFeeIdempotent(admin, bankerId, roomId, feeRef);
    feeCharged = charged;
    if (charged > 0) {
      await insertCeloPlatformFee(admin, charged, "banker_pause_timeout", {
        userId: bankerId,
        idempotencyKey: `celo_pause_timeout_fee_platform_${roomId}`,
      });
    }
  }

  const { error: upErr } = await admin
    .from("celo_rooms")
    .update({
      status: "cancelled",
      abandoned_at: nowIso,
      abandonment_fee_charged: bankerPaused && feeCharged > 0 ? true : false,
      paused_at: null,
      paused_by: null,
      pause_reason: null,
      pause_expires_at: null,
      last_activity: nowIso,
    })
    .eq("id", roomId);

  if (upErr) {
    console.error("[C-Lo pause cleanup] room update failed", { roomId, message: upErr.message });
    return { ok: false, reason: "room_update_failed" };
  }

  console.log("[C-Lo pause timeout cleanup]", {
    roomId,
    bankerId,
    postedCount: postedForRefund.length,
    bankerPaused,
    feeCharged,
  });

  return { ok: true };
}
