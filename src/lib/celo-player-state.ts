/**
 * C-Lo room player / entry state shared by lobby + room UI and realtime merges.
 * Source of truth: `celo_room_players` — a "posted entry" is a row with
 * `role === "player"` and `entry_sc > 0` (GPC, integer cents/scale as stored in DB).
 */

export type CeloEntryPlayerFields = {
  id: string;
  user_id: string;
  role: string;
  entry_sc: number;
  bet_cents: number;
  seat_number: number | null;
  dice_type: string;
};

export function normalizeCeloPlayerRow(row: unknown): CeloEntryPlayerFields {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    role: String(r.role ?? ""),
    entry_sc: Math.max(0, Math.floor(Number(r.entry_sc ?? 0))),
    bet_cents: Math.max(0, Math.floor(Number(r.bet_cents ?? 0))),
    seat_number:
      r.seat_number == null || r.seat_number === ""
        ? null
        : Math.floor(Number(r.seat_number)),
    dice_type: String(r.dice_type ?? "standard"),
  };
}

/** Valid posted entries for "start round": non-banker players with stake. */
export function countStakedEntryPlayers(
  players: { role: string; entry_sc: number }[]
): number {
  return players.filter(
    (p) => p.role === "player" && Math.floor(Number(p.entry_sc ?? 0)) > 0
  ).length;
}

export function mergeCeloPlayerRealtime(
  previous: CeloEntryPlayerFields[],
  payload: {
    eventType: "INSERT" | "UPDATE" | "DELETE" | string;
    new: Record<string, unknown> | null;
    old: Record<string, unknown> | null;
  },
  roomId: string
): CeloEntryPlayerFields[] {
  if (payload.eventType === "DELETE") {
    const id = payload.old && (payload.old as { id?: string }).id;
    if (!id) return previous;
    return previous.filter((p) => p.id !== id);
  }
  if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
    if (!payload.new) return previous;
    const n = { ...(payload.new as Record<string, unknown>) };
    if (String(n.room_id ?? "") !== roomId) return previous;
    const id = String(n.id ?? "");
    if (!id) return previous;
    const previousRow = previous.find((p) => p.id === id);
    // Replica identity or partial row: don't zero entry_sc on UPDATE when omitted.
    if (payload.eventType === "UPDATE" && !("entry_sc" in n) && previousRow) {
      n.entry_sc = previousRow.entry_sc;
    }
    const next = normalizeCeloPlayerRow(n);
    const idx = previous.findIndex((p) => p.id === next.id);
    if (idx >= 0) {
      const copy = previous.slice();
      copy[idx] = { ...copy[idx], ...next };
      return copy.sort(compareCeloPlayerSeat);
    }
    return [...previous, next].sort(compareCeloPlayerSeat);
  }
  return previous;
}

function compareCeloPlayerSeat(
  a: CeloEntryPlayerFields,
  b: CeloEntryPlayerFields
): number {
  const an = a.seat_number;
  const bn = b.seat_number;
  if (an == null && bn == null) return 0;
  if (an == null) return 1;
  if (bn == null) return -1;
  return an - bn;
}
