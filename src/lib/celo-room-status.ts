import type { SupabaseClient } from "@supabase/supabase-js";

export type CeloRoomPhaseAfterRound = "waiting" | "bank_takeover";

/**
 * Empty bank with a seated banker is takeover, even if `bank_busted` was not
 * persisted. A positive bank returns to waiting. No banker stays waiting.
 */
export function statusAfterRoundForBank(room: {
  current_bank_sc?: number | null;
  current_bank_cents?: number | null;
  banker_id?: string | null;
} | null): CeloRoomPhaseAfterRound {
  if (!room) return "waiting";
  const bank = Math.max(
    0,
    Math.floor(Number(room.current_bank_sc ?? room.current_bank_cents ?? 0))
  );
  const hasBanker =
    room.banker_id != null && String(room.banker_id).trim() !== "";
  if (bank <= 0 && hasBanker) return "bank_takeover";
  return "waiting";
}

/** Fields to persist with the post-round status write. Does not move GPC. */
export function roomFlagPatchAfterRoundComplete(
  status: CeloRoomPhaseAfterRound
): { status: CeloRoomPhaseAfterRound; bank_busted?: true } {
  if (status === "bank_takeover") {
    return { status, bank_busted: true };
  }
  return { status };
}

/**
 * After a round fully completes, set room status to `bank_takeover` when the bank
 * is empty and a banker is assigned; otherwise `waiting`.
 * Prevents later "room reset" updates from clobbering bust state with generic waiting.
 */
export async function nextRoomStatusAfterRoundComplete(
  admin: SupabaseClient,
  roomId: string
): Promise<CeloRoomPhaseAfterRound> {
  const { data } = await admin
    .from("celo_rooms")
    .select("bank_busted, current_bank_sc, current_bank_cents, banker_id")
    .eq("id", roomId)
    .maybeSingle();
  return statusAfterRoundForBank(
    data as {
      current_bank_sc?: number | null;
      current_bank_cents?: number | null;
      banker_id?: string | null;
    } | null
  );
}
