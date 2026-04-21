/**
 * UI helpers for C-Lo room — turn order is canonical in DB:
 * celo_rounds.status + current_player_seat + celo_rooms.banker_id.
 * Do not duplicate payout / rule engine logic here.
 */

export type CeloRoomLike = { banker_id?: string | null } | null;
export type CeloRoundLike = {
  status: string;
  current_player_seat?: number | null;
  roll_processing?: boolean | null;
} | null;
export type CeloPlayerLike = {
  user_id: string;
  role: string;
  seat_number: number | null;
};

/** Whose turn it is to roll, or null if between rounds / unknown. */
export function getCurrentRollerUserId(
  room: CeloRoomLike,
  round: CeloRoundLike,
  players: CeloPlayerLike[]
): string | null {
  if (!room || !round || round.status === "completed") return null;
  if (round.roll_processing) return null;
  if (round.status === "banker_rolling") {
    const bid = room.banker_id;
    return bid != null ? String(bid) : null;
  }
  if (round.status === "player_rolling") {
    const seatNeed = Math.floor(Number(round.current_player_seat ?? 0));
    const p = players.find(
      (x) => x.role === "player" && Math.floor(Number(x.seat_number ?? -1)) === seatNeed
    );
    return p?.user_id ?? null;
  }
  return null;
}

export type CeloUiPhase = "waiting" | "ready" | "rolling" | "resolving";

export function deriveCeloUiPhase(
  round: CeloRoundLike,
  opts: { canStartRound: boolean; localRolling: boolean }
): CeloUiPhase {
  if (round?.roll_processing || opts.localRolling) return "resolving";
  if (opts.canStartRound && (!round || round.status === "completed")) return "ready";
  if (round && round.status !== "completed") return "rolling";
  return "waiting";
}
