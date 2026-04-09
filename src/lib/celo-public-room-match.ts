import { isCeloRoomJoinableStatus } from "@/lib/celo-room-constants";

/**
 * Match a public room whose UUID (hex, no dashes) starts with `normalizedCode` (uppercase alphanumeric).
 * Used by GET /api/celo/room/lookup for cross-device lobby codes.
 */
export function matchPublicCeloRoomByUuidPrefix(
  candidates: Array<{ id: string; status?: string; room_type?: string }>,
  normalizedCode: string
): { id: string; status: string; room_type: string } | null {
  const match = candidates.find((r) => {
    if (!isCeloRoomJoinableStatus(r.status)) return false;
    const idCompact = String(r.id)
      .replace(/-/g, "")
      .toUpperCase();
    return idCompact.startsWith(normalizedCode.toUpperCase());
  });
  if (!match) return null;
  return {
    id: match.id,
    status: String(match.status ?? ""),
    room_type: match.room_type ?? "public",
  };
}
