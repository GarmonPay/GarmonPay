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
  const serverStartTime = opts.serverStartTime ?? new Date().toISOString();
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
 * Supabase Realtime broadcast (WebSocket) to all subscribers on `celo-room-{roomId}`.
 * Uses the same channel name as the browser room channel.
 */
export async function broadcastCeloRoomEvent(
  supabase: SupabaseClient,
  roomId: string,
  event: "roll_started" | "roll_finished",
  payload: CeloRollStartedPayload | CeloRollFinishedPayload
): Promise<void> {
  const channelName = `celo-room-${roomId}`;
  const channel = supabase.channel(channelName, {
    config: { broadcast: { ack: false } },
  });

  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => {
      reject(new Error(`celo broadcast subscribe timeout (${channelName})`));
    }, 12_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(to);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(to);
        reject(new Error(`celo broadcast subscribe failed: ${status}`));
      }
    });
  });

  const sendResult = await channel.send({
    type: "broadcast",
    event,
    payload,
  });

  if (sendResult !== "ok") {
    console.error("[celo/broadcast] send not ok:", { roomId, event, sendResult });
  }

  await supabase.removeChannel(channel);
}
