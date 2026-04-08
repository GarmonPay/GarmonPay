import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CELO_ROLL_ANIMATION_DURATION_MS,
  CELO_POST_REVEAL_HOLD_MS,
  CELO_REVEAL_TRANSITION_MS,
} from "@/lib/celo-roll-sync-constants";

export type CeloRollStartedPayload = {
  roundId: string;
  roomId: string;
  serverStartTime: string;
  animationDurationMs: number;
  /** When clients should reveal final dice (UTC ISO). */
  revealAt: string;
  /** When the full UI sequence may return to idle (UTC ISO). */
  sequenceEndAt: string;
  finalDice: [number, number, number];
  kind: "banker" | "player";
  playerRollId?: string;
  rollerUserId?: string;
  syncKey: string;
};

export type CeloRollFinishedPayload = {
  roundId: string;
  roomId: string;
  syncKey: string;
  completedAt: string;
};

export function buildCeloRollStartedPayload(opts: {
  roomId: string;
  roundId: string;
  dice: [number, number, number];
  kind: "banker" | "player";
  playerRollId?: string;
  rollerUserId?: string;
  /** Defaults to now — use only in tests */
  serverStartTime?: string;
}): CeloRollStartedPayload {
  // Normalize to JS ISO format (.000Z) so syncKeys match regardless of whether
  // the timestamp came from new Date().toISOString() or from Postgres ("+00:00" suffix).
  const serverStartTime = opts.serverStartTime
    ? new Date(opts.serverStartTime).toISOString()
    : new Date().toISOString();
  const animationDurationMs = CELO_ROLL_ANIMATION_DURATION_MS;
  const startMs = Date.parse(serverStartTime);
  const revealAt = new Date(startMs + animationDurationMs).toISOString();
  const sequenceEndAt = new Date(
    startMs + animationDurationMs + CELO_REVEAL_TRANSITION_MS + CELO_POST_REVEAL_HOLD_MS
  ).toISOString();
  const syncKey =
    opts.kind === "banker"
      ? `banker:${opts.roundId}:${serverStartTime}`
      : `player:${opts.roundId}:${opts.playerRollId ?? opts.rollerUserId ?? "?"}`;
  return {
    roundId: opts.roundId,
    roomId: opts.roomId,
    serverStartTime,
    animationDurationMs,
    revealAt,
    sequenceEndAt,
    finalDice: opts.dice,
    kind: opts.kind,
    playerRollId: opts.playerRollId,
    rollerUserId: opts.rollerUserId,
    syncKey,
  };
}

/**
 * Server-side Realtime broadcast via Supabase REST API.
 * HTTP POST — no WebSocket overhead, completes in <200ms vs the 1-3s WebSocket subscribe approach.
 * Delivers to all browser subscribers on `celo-room-{roomId}`.
 */
export async function broadcastCeloRoomEvent(
  _supabase: SupabaseClient,
  roomId: string,
  event: "roll_started" | "roll_finished",
  payload: CeloRollStartedPayload | CeloRollFinishedPayload
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.warn("[celo/broadcast] env not configured, skipping broadcast");
    return;
  }

  const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify({
      messages: [
        {
          topic: `realtime:celo-room-${roomId}`,
          event,
          payload,
          private: false,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[celo/broadcast] REST broadcast failed:", {
      roomId,
      event,
      status: res.status,
      text,
    });
  }
}
