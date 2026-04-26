/**
 * Lobby aggregates for C-Lo: which rows count as "live" public tables and how to read bank GPC.
 * Status values are aligned with /api/celo/room (join), create, and round routes.
 */

/** Open / joinable public-room statuses only (excludes completed, cancelled, etc.). */
export const CELO_LOBBY_LIVE_ROOM_STATUSES = new Set([
  "waiting",
  "entry_phase",
  "active",
  "rolling",
  "open",
]);

/** Use with `.in("status", ...)` on `celo_rooms` so cancelled/completed rows never load in the lobby. */
export const CELO_LOBBY_LIST_STATUSES: string[] = [
  "waiting",
  "entry_phase",
  "active",
  "rolling",
  "open",
];

export function isPublicLiveCeloRoom(row: {
  status: string;
  room_type?: string | null;
}): boolean {
  const st = String(row.status ?? "").toLowerCase();
  if (!CELO_LOBBY_LIVE_ROOM_STATUSES.has(st)) return false;
  const rt = row.room_type;
  if (rt == null || rt === "public") return true;
  return false;
}

export function safeBankGpcCents(row: {
  current_bank_sc?: number | null;
  current_bank_cents?: number | null;
}): number {
  const raw = row.current_bank_sc ?? row.current_bank_cents;
  if (raw == null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function countSeatedParticipants(
  rows: { role: string }[] | null | undefined
): number {
  if (!rows?.length) return 0;
  return rows.filter((p) => {
    const r = String(p.role ?? "").toLowerCase();
    return r === "player" || r === "banker";
  }).length;
}
