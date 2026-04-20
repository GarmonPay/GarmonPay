import type { SupabaseClient } from "@supabase/supabase-js";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";

export type EligiblePlayerRow = {
  user_id: string;
  entry_sc: number;
  seat_number: number | null;
};

/** Loose compare for PostgREST int / string mismatches. */
export function celoSeatsEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return na === nb;
}

/** Auth / FK user ids: tolerate dash/case differences between JWT and DB text. */
export function celoSameAuthUserId(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (a == null || b == null) return false;
  const na = String(a).trim().toLowerCase().replace(/-/g, "");
  const nb = String(b).trim().toLowerCase().replace(/-/g, "");
  return na.length > 0 && na === nb;
}

/**
 * Resolve whose turn it is from `current_player_seat` and eligible list (ordered by seat).
 * If seat_number does not match (null vs number drift), fall back to 1-based index in `eligible`.
 */
export function resolveCurrentPlayerForSeat(
  eligible: EligiblePlayerRow[],
  currentSeatRaw: number | null | undefined
): EligiblePlayerRow | null {
  if (eligible.length === 0) return null;
  if (currentSeatRaw == null) {
    return eligible[0] ?? null;
  }
  const match = eligible.find((p) => celoSeatsEqual(p.seat_number, currentSeatRaw));
  if (match) return match;
  const n = Number(currentSeatRaw);
  if (Number.isFinite(n) && n >= 1 && n <= eligible.length) {
    return eligible[n - 1] ?? null;
  }
  return eligible[0] ?? null;
}

export async function countPlayersWithPositiveStake(
  supabase: SupabaseClient,
  roomId: string
): Promise<number> {
  const { data: rows } = await supabase
    .from("celo_room_players")
    .select("entry_sc")
    .eq("room_id", roomId)
    .eq("role", "player");
  const list = (rows ?? []) as Array<{ entry_sc?: number | null }>;
  return list.filter((p) => celoPlayerStakeCents(p) > 0).length;
}

/**
 * Room may be deleted when there are no seated players with money in play (spectators OK).
 */
export async function isRoomEmptyForDelete(
  supabase: SupabaseClient,
  roomId: string
): Promise<{ ok: true } | { ok: false; reason: string; playersWithStake: number }> {
  const n = await countPlayersWithPositiveStake(supabase, roomId);
  if (n > 0) {
    return { ok: false, reason: "players_with_active_stake", playersWithStake: n };
  }
  return { ok: true };
}
