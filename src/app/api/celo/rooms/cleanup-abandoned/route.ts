import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase";
import { creditGpayIdempotent, debitGpayCoins, getUserCoins } from "@/lib/coins";
import { insertCeloPlatformFee } from "@/lib/celo-platform-fee";
import { normalizeCeloUserId } from "@/lib/celo-player-state";
import { processExpiredPauseRoom } from "@/lib/celo-pause-cleanup";

export const runtime = "nodejs";

const IDLE_MS = 10 * 60 * 1000;
const ABANDON_FEE_GPC = 500;

function authorizeCron(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const secret = (
    request.headers.get("x-cron-secret") ??
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "")
  ).trim();
  const expected = process.env.CRON_SECRET?.trim();
  if (expected && secret !== expected) return false;
  return true;
}

function effectiveStakeSc(row: {
  stake_amount_sc?: number | null;
  entry_sc?: number | null;
  bet_cents?: number | null;
}): number {
  const sc = Math.floor(Number(row.stake_amount_sc ?? 0));
  if (sc > 0) return sc;
  return Math.floor(Number(row.entry_sc ?? row.bet_cents ?? 0));
}

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

async function debitAbandonFeeIdempotent(
  admin: SupabaseClient,
  bankerId: string,
  roomId: string,
  reference: string
): Promise<{ charged: number; ok: boolean }> {
  if (await txReferenceExists(admin, reference)) {
    return { charged: 0, ok: true };
  }
  const { gpayCoins } = await getUserCoins(bankerId);
  const charge = Math.min(ABANDON_FEE_GPC, Math.max(0, gpayCoins));
  if (charge <= 0) {
    return { charged: 0, ok: true };
  }
  const d = await debitGpayCoins(
    bankerId,
    charge,
    "C-Lo banker abandonment fee (inactive table)",
    reference,
    "celo_abandon_fee"
  );
  if (!d.success && String(d.message ?? "").toLowerCase().includes("duplicate")) {
    return { charged: 0, ok: true };
  }
  if (!d.success) {
    console.error("[C-Lo abandonment] banker debit failed", {
      roomId,
      bankerId,
      message: d.message,
    });
    return { charged: 0, ok: false };
  }
  return { charged: charge, ok: true };
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

/**
 * POST/GET /api/celo/rooms/cleanup-abandoned
 * Cron: refunds posted players, cancels in-flight rounds, charges banker up to 500 GPC, closes room.
 */
export async function POST(request: Request) {
  return runAbandonmentCleanup(request);
}

export async function GET(request: Request) {
  return runAbandonmentCleanup(request);
}

async function runAbandonmentCleanup(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const cutoff = new Date(Date.now() - IDLE_MS).toISOString();
  const now = new Date().toISOString();

  const pauseProcessed: string[] = [];
  const pauseSkipped: Array<{ roomId: string; reason: string }> = [];
  const { data: pauseExpired } = await admin
    .from("celo_rooms")
    .select("id, banker_id, paused_at, pause_expires_at, paused_by, status")
    .not("paused_at", "is", null)
    .lt("pause_expires_at", now)
    .neq("status", "cancelled");

  for (const prow of pauseExpired ?? []) {
    const pid = String((prow as { id?: string }).id ?? "");
    if (!pid) continue;
    const res = await processExpiredPauseRoom(
      admin,
      prow as { id: string; banker_id: string | null; paused_by?: string | null },
      now
    );
    if (res.ok) pauseProcessed.push(pid);
    else pauseSkipped.push({ roomId: pid, reason: res.reason ?? "unknown" });
  }

  const { data: candidates, error: qErr } = await admin
    .from("celo_rooms")
    .select(
      "id, banker_id, status, last_activity, abandonment_fee_charged, abandoned_at"
    )
    .in("status", ["waiting", "active", "rolling", "entry_phase", "bank_takeover"])
    .lt("last_activity", cutoff)
    .or("abandonment_fee_charged.is.null,abandonment_fee_charged.eq.false")
    .is("paused_at", null);

  if (qErr) {
    return NextResponse.json(
      { message: qErr.message ?? "Query failed" },
      { status: 500 }
    );
  }

  const processed: string[] = [];
  const skipped: Array<{ roomId: string; reason: string }> = [];

  for (const raw of candidates ?? []) {
    const room = raw as {
      id: string;
      banker_id: string | null;
      status: string;
      last_activity?: string | null;
      abandonment_fee_charged?: boolean | null;
    };
    const roomId = String(room.id ?? "");
    if (!roomId || !room.banker_id) {
      skipped.push({ roomId, reason: "missing_banker" });
      continue;
    }

    const { data: players } = await admin
      .from("celo_room_players")
      .select(
        "user_id, role, entry_posted, stake_amount_sc, entry_sc, bet_cents, seat_number"
      )
      .eq("room_id", roomId);

    const bankerId = String(room.banker_id);
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

    if (postedForRefund.length === 0) {
      await admin
        .from("celo_rooms")
        .update({ abandonment_checked_at: now })
        .eq("id", roomId);
      skipped.push({ roomId, reason: "no_posted_players" });
      continue;
    }

    let refundTotalSc = 0;
    let refundsOk = true;
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
      const refKey = `celo_abandon_refund_${roomId}_${uid}`;
      const cr = await creditGpayIdempotent(
        uid,
        amt,
        "C-Lo abandonment — entry refund (banker inactive)",
        refKey,
        "celo_bank_refund"
      );
      if (!cr.success) {
        console.error("[C-Lo abandonment] refund failed", {
          roomId,
          userId: uid,
          message: cr.message,
        });
        refundsOk = false;
        break;
      }
      refundTotalSc += amt;
    }

    if (!refundsOk) {
      skipped.push({ roomId, reason: "refund_failed" });
      continue;
    }

    await resetRoomEntries(admin, roomId);

    await admin
      .from("celo_rounds")
      .update({ status: "cancelled", completed_at: now })
      .eq("room_id", roomId)
      .in("status", ["banker_rolling", "player_rolling", "betting"]);

    const feeRef = `celo_abandon_fee_${roomId}_${bankerId}`;
    const { charged, ok: feeOk } = await debitAbandonFeeIdempotent(
      admin,
      bankerId,
      roomId,
      feeRef
    );

    if (charged > 0) {
      await insertCeloPlatformFee(admin, charged, "banker_abandonment", {
        userId: bankerId,
        idempotencyKey: `celo_abandon_fee_platform_${roomId}`,
      });
    }

    const { error: upErr } = await admin
      .from("celo_rooms")
      .update({
        status: "cancelled",
        abandoned_at: now,
        abandonment_fee_charged: true,
        abandonment_checked_at: now,
        last_activity: now,
      })
      .eq("id", roomId)
      .in("status", ["waiting", "active", "rolling", "entry_phase", "bank_takeover"]);

    if (upErr) {
      console.error("[C-Lo abandonment] room update failed", {
        roomId,
        message: upErr.message,
      });
      skipped.push({ roomId, reason: "room_update_failed" });
      continue;
    }

    console.log("[C-Lo abandonment cleanup]", {
      roomId,
      bankerId,
      lastActivity: room.last_activity,
      playerCount: players?.length ?? 0,
      postedPlayerCount: postedForRefund.length,
      refundTotalSc,
      abandonmentFeeSc: charged,
      feeLedgerOk: feeOk,
    });

    processed.push(roomId);
  }

  return NextResponse.json({
    ok: true,
    cutoff,
    processed,
    skipped,
    pauseTimeoutProcessed: pauseProcessed,
    pauseTimeoutSkipped: pauseSkipped,
  });
}
