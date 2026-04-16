import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { mergeCeloRoomUpdate, normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { celoPlayerStakeRefundReference } from "@/lib/celo-room-refund-refs";
import { creditGpayIdempotent } from "@/lib/coins";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { celoQaLog } from "@/lib/celo-qa-log";
import { processCeloTurnTimeouts } from "@/lib/celo-turn-timeout";

export const runtime = "nodejs";

const STALE_MS = 24 * 60 * 60 * 1000;

function expireBankReference(roomId: string): string {
  return `celo_room_expire_${roomId}`;
}

async function runCeloCleanup(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = (
    request.headers.get("x-cron-secret") ??
    (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "")
  ).trim();
  const expected = process.env.CRON_SECRET?.trim();
  if (expected && secret !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const turnTimer = await processCeloTurnTimeouts(admin);

  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();

  const { data: roomRows, error: roomsErr } = await admin
    .from("celo_rooms")
    .select("*")
    .in("status", ["waiting", "active"])
    .lt("created_at", staleBefore);

  if (roomsErr) {
    console.error("[celo-cleanup]", roomsErr.message);
    return NextResponse.json({ message: "Query failed", error: roomsErr.message }, { status: 500 });
  }

  let cancelled = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const rawRoom of roomRows ?? []) {
    const room = rawRoom as Record<string, unknown>;
    const roomId = String(room.id ?? "");
    if (!roomId) continue;

    try {
      const { count: completedCount, error: completedErr } = await admin
        .from("celo_rounds")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId)
        .eq("status", "completed");

      if (completedErr) {
        errors.push(`${roomId}: completed count — ${completedErr.message}`);
        continue;
      }

      if ((completedCount ?? 0) > 0) {
        skipped += 1;
        continue;
      }

      const { error: delRoundsErr } = await admin.from("celo_rounds").delete().eq("room_id", roomId);
      if (delRoundsErr) {
        errors.push(`${roomId}: delete rounds — ${delRoundsErr.message}`);
        continue;
      }

      const { data: playerRows, error: playersErr } = await admin
        .from("celo_room_players")
        .select("user_id, role, entry_sc, bet_cents")
        .eq("room_id", roomId);

      if (playersErr) {
        errors.push(`${roomId}: load players — ${playersErr.message}`);
        continue;
      }

      const players = (playerRows ?? []) as Array<{
        user_id: string;
        role: string;
        entry_sc?: number | null;
        bet_cents?: number | null;
      }>;

      let playerRefunds = 0;
      let playerRefundFailed = false;
      for (const p of players) {
        if (p.role !== "player") continue;
        const cents = celoPlayerStakeCents(p);
        if (cents <= 0) continue;
        const ref = celoPlayerStakeRefundReference(roomId, p.user_id);
        const result = await creditGpayIdempotent(
          p.user_id,
          cents,
          "C-Lo stake refund (stale room cleanup)",
          ref,
          "celo_refund"
        );
        if (!result.success) {
          errors.push(`${roomId}: player refund ${p.user_id} — ${result.message ?? "failed"}`);
          playerRefundFailed = true;
          break;
        }
        playerRefunds += 1;
      }
      if (playerRefundFailed) continue;

      const normalized = normalizeCeloRoomRow(room);
      const bankerId = String(room.banker_id ?? normalized?.banker_id ?? "");
      const bankCents = Math.max(
        0,
        Math.round(
          Number(
            (room as { current_bank_sc?: unknown }).current_bank_sc ??
              (room as { current_bank_cents?: unknown }).current_bank_cents ??
              normalized?.current_bank_cents ??
              0
          )
        )
      );

      if (bankCents > 0 && bankerId) {
        const bankRef = expireBankReference(roomId);
        const bankResult = await creditGpayIdempotent(
          bankerId,
          bankCents,
          "C-Lo bank refund (cron stale room)",
          bankRef,
          "celo_bank_refund"
        );
        if (!bankResult.success) {
          errors.push(`${roomId}: bank refund — ${bankResult.message ?? "failed"}`);
          continue;
        }
      }

      const { error: delPlayersErr } = await admin.from("celo_room_players").delete().eq("room_id", roomId);
      if (delPlayersErr) {
        errors.push(`${roomId}: clear players — ${delPlayersErr.message}`);
        continue;
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
        errors.push(`${roomId}: update room — ${updErr.message}`);
        continue;
      }

      await admin.from("celo_audit_log").insert({
        room_id: roomId,
        user_id: null,
        action: "room_expired_abandoned",
        details: {
          reason: "cron_stale_no_completed_rounds",
          player_refunds: playerRefunds,
          bank_refunded_cents: bankCents > 0 && bankerId ? bankCents : 0,
          bank_reference: bankCents > 0 && bankerId ? expireBankReference(roomId) : null,
        },
      });

      console.log("[celo-cleanup] cancelled abandoned room", {
        roomId,
        playerRefunds,
        bankRefundedCents: bankCents > 0 && bankerId ? bankCents : 0,
      });

      celoQaLog("celo_room_expire_cleanup", {
        roomId,
        playerRefunds,
        bankRefundedCents: bankCents > 0 && bankerId ? bankCents : 0,
      });

      cancelled += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${roomId}: ${msg}`);
    }
  }

  return NextResponse.json({
    success: true,
    turn_timer: {
      banker_stale: turnTimer.bankerStale,
      player_stale: turnTimer.playerStale,
      errors: turnTimer.errors.length ? turnTimer.errors : undefined,
    },
    cancelled,
    skipped_had_completed_rounds: skipped,
    candidates: (roomRows ?? []).length,
    errors: errors.length ? errors : undefined,
  });
}

export async function GET(request: Request) {
  return runCeloCleanup(request);
}

export async function POST(request: Request) {
  return runCeloCleanup(request);
}
