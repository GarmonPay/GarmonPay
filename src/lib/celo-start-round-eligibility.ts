import { celoPlayerStakeCents } from "@/lib/celo-player-stake";
import { celoSameAuthUserId } from "@/lib/celo-room-rules";

export type CeloStartRoundPlayerRow = {
  role: string;
  entry_sc?: number | null;
  bet_cents?: number | null;
};

/**
 * Client-side gate for the Start Round action — mirrors server rules closely enough
 * that the button is disabled when the API would reject, and surfaces a stable reason string.
 */
export function getCeloStartRoundBlockReason(params: {
  room: { status: string; banker_id: string } | null;
  myUserId: string;
  myRole: "banker" | "player" | "spectator";
  currentRound: { status?: string } | null;
  players: CeloStartRoundPlayerRow[];
  startRoundBusy?: boolean;
}): string | null {
  if (params.startRoundBusy) {
    return "Start request already in progress";
  }
  if (!params.room) {
    return "Room missing";
  }
  if (params.myRole !== "banker") {
    return "Only banker can start round";
  }
  if (!celoSameAuthUserId(params.room.banker_id, params.myUserId)) {
    return "Only banker can start round";
  }

  const rs = String(params.room.status ?? "");
  if (rs !== "waiting" && rs !== "active") {
    if (rs === "rolling") {
      return "Room is already rolling";
    }
    return `Room status does not allow starting (${rs || "unknown"})`;
  }

  if (params.currentRound) {
    return "Active round already exists";
  }

  const seatedWithStake = params.players.filter(
    (p) => p.role === "player" && celoPlayerStakeCents(p) > 0,
  );
  if (seatedWithStake.length < 1) {
    return "Cannot start round without at least 1 seated player with an entry";
  }

  return null;
}

/** Table UI: at least one player row has a positive stake (entry_sc and/or bet_cents). */
export function celoHasPlayerWithStake(players: CeloStartRoundPlayerRow[]): boolean {
  return players.some((p) => p.role === "player" && celoPlayerStakeCents(p) > 0);
}
