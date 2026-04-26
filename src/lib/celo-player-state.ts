/**
 * C-Lo room player / entry state shared by lobby + room UI and realtime merges.
 * Source of truth: `celo_room_players` — a "posted entry" is a row with
 * `role === "player"` and `entry_sc > 0` (GPC, integer cents/scale as stored in DB).
 */

/** Fields embedded from `public.users` (FK user_id). */
export const CELO_USER_PROFILE_FIELDS = "id,email,full_name,avatar_url,username";

/** Use with `.from("celo_room_players").select(...)` so UI can resolve display names. */
export const CELO_ROOM_PLAYERS_USER_EMBED = `users:user_id(${CELO_USER_PROFILE_FIELDS})`;

/** Same embed on `celo_chat.user_id` → `users`. */
export const CELO_CHAT_USER_EMBED = `users:user_id(${CELO_USER_PROFILE_FIELDS})`;

export const CELO_CHAT_SELECT_WITH_USER = `id, user_id, message, created_at, is_system, ${CELO_CHAT_USER_EMBED}`;

export type CeloEntryPlayerFields = {
  id: string;
  user_id: string;
  role: string;
  entry_sc: number;
  bet_cents: number;
  seat_number: number | null;
  dice_type: string;
  /** True once the player has posted an entry for the current window (DB + legacy stake). */
  entry_posted: boolean;
  /** Posted stake in GPC (aligned with entry_sc / bet_cents). */
  stake_amount_sc: number;
  /** seated | active (posted entry). */
  status: string;
  room_id?: string;
  /** Set by room state API when shaping responses. */
  is_banker?: boolean;
  /** From joined `users` row (optional). */
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
  avatar_url?: string | null;
};

function extractUsersEmbed(r: Record<string, unknown>): Record<string, unknown> | null {
  const raw = r.users;
  if (raw == null) return null;
  if (Array.isArray(raw)) return (raw[0] as Record<string, unknown>) ?? null;
  return raw as Record<string, unknown>;
}

export function normalizeCeloPlayerRow(row: unknown): CeloEntryPlayerFields {
  const r = row as Record<string, unknown>;
  const u = extractUsersEmbed(r);
  const str = (v: unknown) => {
    const s = String(v ?? "").trim();
    return s.length ? s : null;
  };
  const entrySc = Math.max(0, Math.floor(Number(r.entry_sc ?? 0)));
  const betCents = Math.max(0, Math.floor(Number(r.bet_cents ?? 0)));
  const stakeCol = Math.max(0, Math.floor(Number(r.stake_amount_sc ?? 0)));
  const legacyStake = Math.max(entrySc, betCents);
  const stakeAmountSc = Math.max(stakeCol, legacyStake);
  const explicitPosted = r.entry_posted === true;
  const entryPosted =
    explicitPosted ||
    (r.entry_posted !== false && legacyStake > 0);
  const seatStatusRaw = String(r.player_seat_status ?? "").trim();
  const status =
    seatStatusRaw ||
    (entryPosted && stakeAmountSc > 0 ? "active" : "seated");
  const isBankerShaped = r.is_banker;
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    role: String(r.role ?? ""),
    entry_sc: entrySc,
    bet_cents: betCents,
    seat_number:
      r.seat_number == null || r.seat_number === ""
        ? null
        : Math.floor(Number(r.seat_number)),
    dice_type: String(r.dice_type ?? "standard"),
    entry_posted: entryPosted,
    stake_amount_sc: stakeAmountSc,
    status,
    room_id: r.room_id != null ? String(r.room_id) : undefined,
    is_banker: typeof isBankerShaped === "boolean" ? isBankerShaped : undefined,
    full_name: u ? str(u.full_name) : null,
    username: u ? str(u.username) : null,
    email: u ? str(u.email) : null,
    avatar_url: u ? str(u.avatar_url) : null,
  };
}

/**
 * Public shape for GET /api/celo/room/state (and post-entry responses).
 * Keeps `users` embed so `normalizeCeloPlayerRow` still works on the client.
 */
export function shapeCeloRoomStatePlayer(
  row: Record<string, unknown>,
  roomBankerId: string | null
): Record<string, unknown> {
  const uid = String(row.user_id ?? "");
  const stake = Math.max(
    Math.floor(Number(row.stake_amount_sc ?? 0)),
    Math.floor(Number(row.entry_sc ?? 0)),
    Math.floor(Number(row.bet_cents ?? 0))
  );
  const posted = row.entry_posted === true || stake > 0;
  return {
    id: String(row.id),
    room_id: String(row.room_id ?? ""),
    user_id: uid,
    role: row.role,
    seat_number: row.seat_number,
    bet_cents: row.bet_cents,
    entry_sc: row.entry_sc,
    dice_type: row.dice_type,
    entry_posted: posted,
    stake_amount_sc: stake,
    player_seat_status: row.player_seat_status ?? (posted ? "active" : "seated"),
    joined_at: row.joined_at,
    is_banker:
      roomBankerId != null &&
      normalizeCeloUserId(uid) === normalizeCeloUserId(roomBankerId),
    status: String(row.player_seat_status ?? (posted ? "active" : "seated")),
    created_at: row.joined_at ?? row.created_at ?? null,
    users: row.users,
  };
}

/**
 * Valid posted entries for "start round": seated `player` role with stake,
 * excluding the room banker even if a bad row marks them as player.
 */
/** GPC stake for this row (legacy column names use *_cents). */
export function effectiveStakeSc(p: { entry_sc?: unknown; bet_cents?: unknown }): number {
  return Math.max(
    0,
    Math.floor(Number(p.entry_sc ?? 0)),
    Math.floor(Number((p as { bet_cents?: unknown }).bet_cents ?? 0))
  );
}

/** Compare auth / FK user ids regardless of hyphen casing in string form. */
export function normalizeCeloUserId(id: string | null | undefined): string {
  return String(id ?? "")
    .trim()
    .replace(/-/g, "")
    .toLowerCase();
}

/**
 * True if this `celo_room_players` row counts toward "banker may start round":
 * posted stake, not the room banker (by id), not spectator/banker seat.
 * Role must be `player` (case-insensitive) or empty (partial realtime / legacy rows).
 */
export function isStakedNonBankerForStartRound(
  p: {
    role?: string;
    user_id?: string;
    entry_sc?: number;
    bet_cents?: number;
    entry_posted?: boolean;
    stake_amount_sc?: number;
  },
  bankerUserId?: string | null
): boolean {
  const banker = normalizeCeloUserId(bankerUserId);
  const uid = normalizeCeloUserId(p.user_id);
  if (banker.length > 0 && uid === banker) return false;

  const role = String(p.role ?? "").trim().toLowerCase();
  if (role === "spectator" || role === "banker") return false;
  if (role.length > 0 && role !== "player") return false;

  if (p.entry_posted === false) return false;

  const stake = Math.max(
    Math.floor(Number(p.stake_amount_sc ?? 0)),
    effectiveStakeSc(p)
  );
  return stake > 0;
}

export function countStakedEntryPlayers(
  players: {
    role: string;
    entry_sc: number;
    user_id?: string;
    bet_cents?: number;
    entry_posted?: boolean;
    stake_amount_sc?: number;
  }[],
  bankerUserId?: string | null
): number {
  return players.filter((p) => isStakedNonBankerForStartRound(p, bankerUserId)).length;
}

/** Seated `player` rows (excludes spectators); used to enable “Start round” before any entry is posted. */
export function countSeatedCeloPlayerRoles(
  players: { role: string }[] | null | undefined
): number {
  if (!players?.length) return 0;
  return players.filter((p) => String(p.role ?? "").toLowerCase() === "player")
    .length;
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
    // Replica identity or partial row: don't zero entry / stake on UPDATE when omitted.
    if (payload.eventType === "UPDATE" && previousRow) {
      if (!("entry_sc" in n)) n.entry_sc = previousRow.entry_sc;
      if (!("stake_amount_sc" in n)) n.stake_amount_sc = previousRow.stake_amount_sc;
      if (!("entry_posted" in n)) n.entry_posted = previousRow.entry_posted;
      if (!("player_seat_status" in n)) {
        (n as Record<string, unknown>).player_seat_status = previousRow.status;
      }
    }
    const next = normalizeCeloPlayerRow(n);
    const idx = previous.findIndex((p) => p.id === next.id);
    if (idx >= 0) {
      const copy = previous.slice();
      const prevRow = copy[idx];
      const mergedProfile = {
        full_name: next.full_name ?? prevRow.full_name ?? null,
        username: next.username ?? prevRow.username ?? null,
        email: next.email ?? prevRow.email ?? null,
        avatar_url: next.avatar_url ?? prevRow.avatar_url ?? null,
      };
      copy[idx] = { ...prevRow, ...next, ...mergedProfile };
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
