import type { SupabaseClient } from "@supabase/supabase-js";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { systemCloseCeloRoomWithRefunds } from "@/lib/celo-room-system-close";
import { CELO_LOBBY_STATUSES } from "@/lib/celo-room-constants";

type Admin = SupabaseClient;

const WAITING_STALE_MS = 15 * 60 * 1000;
const ACTIVE_STALE_MS = 30 * 60 * 1000;

function sumPlayerStakesCents(
  rows: Array<{ role?: string; entry_sc?: number | null }>
): number {
  let t = 0;
  for (const p of rows) {
    if (p.role !== "player") continue;
    t += celoPlayerStakeCents(p);
  }
  return t;
}

/**
 * Mark abandoned public rooms cancelled (refunds via system close). Safe to call on each lobby read.
 */
export async function cleanupStalePublicLobbyRooms(admin: Admin): Promise<{
  attempted: number;
  closed: number;
  skipped: number;
  errors: string[];
}> {
  const now = Date.now();
  const waitingBefore = new Date(now - WAITING_STALE_MS).toISOString();
  const activeBefore = new Date(now - ACTIVE_STALE_MS).toISOString();

  const errors: string[] = [];
  let closed = 0;
  let skipped = 0;

  const { data: waitingRows, error: wErr } = await admin
    .from("celo_rooms")
    .select("id,status,last_activity,room_type")
    .eq("room_type", "public")
    .eq("status", "waiting")
    .lt("last_activity", waitingBefore);

  if (wErr) {
    errors.push(`waiting query: ${wErr.message}`);
    return { attempted: 0, closed: 0, skipped: 0, errors };
  }

  const { data: activeRows, error: aErr } = await admin
    .from("celo_rooms")
    .select("id,status,last_activity,room_type")
    .eq("room_type", "public")
    .in("status", ["active", "rolling"])
    .lt("last_activity", activeBefore);

  if (aErr) {
    errors.push(`active query: ${aErr.message}`);
  }

  const candidates = [...(waitingRows ?? []), ...(aErr ? [] : activeRows ?? [])] as Array<{
    id: string;
    status: string;
  }>;

  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  for (const c of unique) {
    const roomId = String(c.id);
    const { count: playerSeatCount, error: pcErr } = await admin
      .from("celo_room_players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("role", "player");

    if (pcErr) {
      errors.push(`${roomId}: count players ${pcErr.message}`);
      skipped += 1;
      continue;
    }

    const { data: prow, error: prErr } = await admin
      .from("celo_room_players")
      .select("role, entry_sc")
      .eq("room_id", roomId);

    if (prErr) {
      errors.push(`${roomId}: players ${prErr.message}`);
      skipped += 1;
      continue;
    }

    const stakeSum = sumPlayerStakesCents((prow ?? []) as Parameters<typeof sumPlayerStakesCents>[0]);
    const hasSeatedPlayers = (playerSeatCount ?? 0) > 0;

    if (c.status === "waiting") {
      if (hasSeatedPlayers || stakeSum > 0) {
        skipped += 1;
        continue;
      }
      const r = await systemCloseCeloRoomWithRefunds(admin, roomId, {
        reason: "stale_public_waiting_empty",
        auditUserId: null,
      });
      if (r.ok) closed += 1;
      else {
        skipped += 1;
        if (!String(r.error).includes("Round in progress")) {
          errors.push(`${roomId}: ${r.error}`);
        }
      }
      continue;
    }

    if (stakeSum > 0 || hasSeatedPlayers) {
      skipped += 1;
      continue;
    }

    const r2 = await systemCloseCeloRoomWithRefunds(admin, roomId, {
      reason: "stale_public_active_no_stakes",
      auditUserId: null,
    });
    if (r2.ok) closed += 1;
    else {
      skipped += 1;
      if (!String(r2.error).includes("Round in progress")) {
        errors.push(`${roomId}: ${r2.error}`);
      }
    }
  }

  return { attempted: unique.length, closed, skipped, errors };
}

export type PublicLobbyRoomRow = Record<string, unknown>;

/**
 * Canonical public lobby list: cleanup stale rows, then return visible public rooms (service role).
 */
export async function getPublicLobbyRoomsWithCleanup(admin: Admin): Promise<{
  rooms: PublicLobbyRoomRow[];
  cleanup: { attempted: number; closed: number; skipped: number; errors: string[] };
  queryCount: number;
}> {
  const cleanup = await cleanupStalePublicLobbyRooms(admin);

  const { data, error } = await admin
    .from("celo_rooms")
    .select("*")
    .eq("room_type", "public")
    .in("status", [...CELO_LOBBY_STATUSES])
    .order("last_activity", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[celo/public-rooms] select failed", error.message);
    throw new Error(error.message);
  }

  const rooms = (data ?? []) as PublicLobbyRoomRow[];
  console.info("[celo/public-rooms]", {
    queryCount: rooms.length,
    cleanupClosed: cleanup.closed,
    cleanupAttempted: cleanup.attempted,
    cleanupSkipped: cleanup.skipped,
  });
  if (cleanup.errors.length > 0) {
    console.warn("[celo/public-rooms] cleanup warnings", cleanup.errors.slice(0, 10));
  }

  return { rooms, cleanup, queryCount: rooms.length };
}
