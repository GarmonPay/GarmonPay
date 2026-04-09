/**
 * C-Lo room lifecycle — DB values (celo_rooms.status).
 * Product terms: "open" ≈ waiting | active | rolling; "closed" ≈ completed | cancelled (and future expired).
 */

export const CELO_LOBBY_STATUSES = ["waiting", "active", "rolling"] as const;

export type CeloLobbyStatus = (typeof CELO_LOBBY_STATUSES)[number];

export function isCeloLobbyStatus(status: string | null | undefined): status is CeloLobbyStatus {
  return CELO_LOBBY_STATUSES.includes(status as CeloLobbyStatus);
}

/** Rooms players can join from the lobby or by code (not completed/cancelled). */
export function isCeloRoomJoinableStatus(status: string | null | undefined): boolean {
  return isCeloLobbyStatus(status);
}
