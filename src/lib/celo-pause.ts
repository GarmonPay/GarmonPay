import type { SupabaseClient } from "@supabase/supabase-js";

/** Pause window length (server + client). */
export const CELO_PAUSE_DURATION_MS = 5 * 60 * 1000;

export type CeloRoomPauseFields = {
  status?: string | null;
  paused_at?: string | null;
  pause_expires_at?: string | null;
  paused_by?: string | null;
  banker_id?: string | null;
};

export type CeloRoundPauseFields = {
  status?: string | null;
  roll_processing?: boolean | null;
  banker_roll_in_flight?: boolean | null;
};

/** True while pause is active (not expired by clock). */
export function isRoomPauseActive(room: CeloRoomPauseFields | null | undefined): boolean {
  if (!room?.paused_at || !room.pause_expires_at) return false;
  const exp = new Date(String(room.pause_expires_at)).getTime();
  return Number.isFinite(exp) && exp > Date.now();
}

export function roomBlocksActionsDueToPause(
  room: CeloRoomPauseFields | null | undefined
): boolean {
  if (!room?.paused_at) return false;
  const exp = room.pause_expires_at ? new Date(String(room.pause_expires_at)).getTime() : NaN;
  if (Number.isFinite(exp) && exp > Date.now()) return true;
  // Expired but cleanup not run yet — still block client actions until server clears.
  return Number.isFinite(exp) && exp <= Date.now();
}

function roundBlocksPauseMessage(
  round: CeloRoundPauseFields | null | undefined
): string | null {
  const r = round;
  if (!r) return null;
  const st = String(r.status ?? "").toLowerCase();
  if (["banker_rolling", "player_rolling", "betting"].includes(st)) {
    return "round_in_progress";
  }
  if (r.roll_processing === true) return "roll_processing";
  if (r.banker_roll_in_flight === true) return "banker_roll_in_flight";
  return null;
}

/** Banker pause: room must be waiting or active (spec). */
export function canBankerInitiatePause(
  room: { status?: string | null },
  round: CeloRoundPauseFields | null | undefined
): { ok: true } | { ok: false; reason: string } {
  const rs = String(room.status ?? "").toLowerCase();
  if (rs === "rolling") return { ok: false, reason: "room_is_rolling" };
  if (!["waiting", "active"].includes(rs)) {
    return { ok: false, reason: "room_status_not_pausable_for_banker" };
  }
  const rb = roundBlocksPauseMessage(round);
  if (rb) return { ok: false, reason: rb };
  return { ok: true };
}

/** Player requests / votes: also allow entry_phase. */
export function canPlayerInitiatePauseFlow(
  room: { status?: string | null },
  round: CeloRoundPauseFields | null | undefined
): { ok: true } | { ok: false; reason: string } {
  const rs = String(room.status ?? "").toLowerCase();
  if (rs === "rolling") return { ok: false, reason: "room_is_rolling" };
  if (!["waiting", "active", "entry_phase"].includes(rs)) {
    return { ok: false, reason: "room_status_not_pausable" };
  }
  const rb = roundBlocksPauseMessage(round);
  if (rb) return { ok: false, reason: rb };
  return { ok: true };
}

/** API routes (bank, roll, …): block whenever pause columns are set until resume/cleanup. */
export function isRoomPauseBlockingActions(
  room: CeloRoomPauseFields | null | undefined
): boolean {
  return Boolean(room?.paused_at);
}

/** Fetch latest round row for pause checks (single round per room at a time). */
export async function fetchLatestRoundForPause(
  admin: SupabaseClient,
  roomId: string
): Promise<CeloRoundPauseFields | null> {
  const { data } = await admin
    .from("celo_rounds")
    .select("id, status, roll_processing, banker_roll_in_flight")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CeloRoundPauseFields) ?? null;
}

export function majorityThreshold(eligibleCount: number): number {
  if (eligibleCount <= 0) return 999;
  return Math.floor(eligibleCount / 2) + 1;
}
