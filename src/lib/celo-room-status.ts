import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * After a round fully completes, set room status to `bank_takeover` when the bank
 * is busted/empty and a successor banker is assigned; otherwise `waiting`.
 * Prevents later "room reset" updates from clobbering bust state with generic waiting.
 */
export async function nextRoomStatusAfterRoundComplete(
  admin: SupabaseClient,
  roomId: string
): Promise<"waiting" | "bank_takeover"> {
  const { data } = await admin
    .from("celo_rooms")
    .select("bank_busted, current_bank_sc, current_bank_cents, banker_id")
    .eq("id", roomId)
    .maybeSingle();
  const r = data as {
    bank_busted?: boolean | null;
    current_bank_sc?: number | null;
    current_bank_cents?: number | null;
    banker_id?: string | null;
  } | null;
  if (!r) return "waiting";
  const bank = Math.max(
    0,
    Math.floor(Number(r.current_bank_sc ?? r.current_bank_cents ?? 0))
  );
  if (
    r.bank_busted === true &&
    bank <= 0 &&
    r.banker_id != null &&
    String(r.banker_id).trim() !== ""
  ) {
    return "bank_takeover";
  }
  return "waiting";
}
