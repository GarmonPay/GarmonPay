/*
 * C-Lo aggregate merge: room + players + round share a logical revision clock.
 * Prefer newest DB timestamps (updated_at, last_activity, created_at); optional
 * client synthetic updated_at for join/roll paths when the API omits clocks.
 */

export type CeloMergeSource = "unknown" | "realtime" | "fetch" | "join" | "roll";

export type CeloAggregateState<
  Rm extends Record<string, unknown> = Record<string, unknown>,
  Pl extends { id: string; user_id: string; seat_number?: number | null } = {
    id: string;
    user_id: string;
    seat_number?: number | null;
  },
  Rn extends Record<string, unknown> = Record<string, unknown>,
> = {
  /** Optional logical clock for merge ordering (ISO string). */
  updated_at?: string | null;
  room: Rm | null;
  players: Pl[];
  currentRound: Rn | null;
};

export type CeloMergeOptions = {
  /** Full player list from fetch — membership matches server; merge overlays prev rows by id */
  playersSnapshot?: boolean;
};

function ts(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = new Date(String(value)).getTime();
  return Number.isFinite(n) ? n : 0;
}

function roomRevision(r: Record<string, unknown> | null): number {
  if (!r) return 0;
  return Math.max(ts(r.updated_at), ts(r.last_activity), ts(r.created_at));
}

function roundRevision(r: Record<string, unknown> | null): number {
  if (!r) return 0;
  return Math.max(ts(r.updated_at), ts(r.created_at));
}

function aggregateRevision<
  Rm extends Record<string, unknown>,
  Pl extends { id: string; user_id: string },
  Rn extends Record<string, unknown>,
>(agg: CeloAggregateState<Rm, Pl, Rn>): number {
  const wall = ts(agg.updated_at);
  return Math.max(wall, roomRevision(agg.room), roundRevision(agg.currentRound));
}

export function mergePlayers<
  Pl extends { id: string; user_id: string; seat_number?: number | null },
>(
  prev: Pl[],
  incoming: Pl[] | undefined,
  opts?: { snapshot?: boolean }
): Pl[] {
  if (!incoming) return prev;

  if (opts?.snapshot) {
    const prevById = new Map(prev.map((p) => [p.id, p]));
    const merged = incoming.map((row) => {
      const old = prevById.get(row.id);
      return old ? ({ ...(old as object), ...(row as object) } as Pl) : row;
    }) as Pl[];
    return sortPlayersBySeat(merged);
  }

  let next = [...prev];
  for (const row of incoming) {
    const idx = next.findIndex((p) => p.id === row.id || p.user_id === row.user_id);
    if (idx >= 0) {
      next[idx] = { ...(next[idx] as object), ...(row as object) } as Pl;
    } else {
      next.push(row);
    }
  }
  return sortPlayersBySeat(next);
}

function sortPlayersBySeat<
  Pl extends { seat_number?: number | null },
>(list: Pl[]): Pl[] {
  return [...list].sort((a, b) => {
    const an = a.seat_number;
    const bn = b.seat_number;
    if (an == null && bn == null) return 0;
    if (an == null) return 1;
    if (bn == null) return -1;
    return an - bn;
  });
}

export function resolveRound<Rn extends Record<string, unknown>>(
  prev: Rn | null,
  incoming: Rn | null | undefined,
  isIncomingNewer: boolean
): Rn | null {
  if (incoming === undefined) return prev;
  if (incoming === null) return isIncomingNewer ? null : prev;
  if (!prev) return incoming as Rn;
  const pt = roundRevision(prev);
  const it = roundRevision(incoming);
  if (isIncomingNewer || it >= pt) {
    return { ...(prev as object), ...(incoming as object) } as Rn;
  }
  return prev;
}

function incomingEffectiveTime<
  Rm extends Record<string, unknown>,
  Pl extends { id: string; user_id: string },
  Rn extends Record<string, unknown>,
>(
  incoming: Partial<CeloAggregateState<Rm, Pl, Rn>> & { updated_at?: string | null },
  source: CeloMergeSource
): number {
  let t = ts(incoming.updated_at);
  if (incoming.room) {
    t = Math.max(t, roomRevision(incoming.room as Rm));
  }
  if (incoming.currentRound) {
    t = Math.max(t, roundRevision(incoming.currentRound as Rn));
  }
  if (t === 0 && (source === "join" || source === "roll")) {
    t = Date.now();
  }
  return t;
}

/**
 * Single merge entry for room + players + round. Never blindly replaces players
 * unless playersSnapshot is set (fetch full list).
 *
 * Clock: prev.updated_at / incoming.updated_at (when set) participate together with
 * room.last_activity / round.updated_at via aggregateRevision / incomingEffectiveTime.
 */
export function applyCeloStateUpdate<
  Rm extends Record<string, unknown>,
  Pl extends { id: string; user_id: string; seat_number?: number | null },
  Rn extends Record<string, unknown>,
>(
  prev: CeloAggregateState<Rm, Pl, Rn>,
  incoming: Partial<CeloAggregateState<Rm, Pl, Rn>> & { updated_at?: string | null },
  source: CeloMergeSource = "unknown",
  opts?: CeloMergeOptions
): CeloAggregateState<Rm, Pl, Rn> & {
  lastUpdatedSource: CeloMergeSource;
  lastUpdatedAt: number;
} {
  const prevTime = aggregateRevision(prev);
  const nextTime = incomingEffectiveTime(incoming, source);
  const isIncomingNewer = nextTime >= prevTime;

  let nextRoom: Rm | null = prev.room;
  if (isIncomingNewer && incoming.room !== undefined) {
    if (incoming.room === null) {
      nextRoom = null;
    } else {
      nextRoom = {
        ...(prev.room ?? ({} as Rm)),
        ...(incoming.room as object),
      } as Rm;
    }
  }

  const mergedPlayers = mergePlayers(prev.players, incoming.players as Pl[] | undefined, {
    snapshot: opts?.playersSnapshot === true,
  });

  let nextRound: Rn | null = prev.currentRound;
  if (incoming.currentRound !== undefined) {
    nextRound = resolveRound(
      prev.currentRound,
      incoming.currentRound as Rn | null | undefined,
      isIncomingNewer
    );
  }

  const now = Date.now();
  const nextUpdatedAt =
    isIncomingNewer && incoming.updated_at != null && incoming.updated_at !== ""
      ? incoming.updated_at
      : prev.updated_at;

  return {
    updated_at: nextUpdatedAt,
    room: nextRoom,
    players: mergedPlayers,
    currentRound: nextRound,
    lastUpdatedSource: source,
    lastUpdatedAt: now,
  };
}
