/**
 * Server-only: rotate banker seat among seated banker + players after a completed round.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";

/** Same solvency rule as room create: max_players × max_bet_cents. */
function requiredBankrollCents(maxPlayers: number, maxBetCents: number): number {
  return maxPlayers * maxBetCents;
}

export async function rotateBankerAfterRound(supabase: SupabaseClient, roomId: string): Promise<void> {
  const { data: room, error: roomErr } = await supabase
    .from("celo_rooms")
    .select("id, banker_id, max_bet_cents, max_players, status")
    .eq("id", roomId)
    .maybeSingle();

  if (roomErr || !room) return;
  if (["cancelled", "completed"].includes(String(room.status))) return;

  const bankerId = room.banker_id as string | null;
  if (!bankerId) return;

  const maxBet = Number(room.max_bet_cents ?? 0);
  const maxPlayers = Number(room.max_players ?? 6);
  const required = requiredBankrollCents(maxPlayers, maxBet);
  if (required <= 0) return;

  const { data: seats } = await supabase
    .from("celo_room_players")
    .select("user_id, role, seat_number")
    .eq("room_id", roomId)
    .in("role", ["banker", "player"])
    .order("seat_number", { ascending: true });

  if (!seats?.length) return;

  type Seat = { user_id: string; role: string; seat_number: number | null };
  const ordered = seats as Seat[];
  const idx = ordered.findIndex((s) => s.user_id === bankerId);
  if (idx < 0) return;

  const n = ordered.length;
  if (n < 2) return;

  for (let step = 1; step < n; step++) {
    const nextIdx = (idx + step) % n;
    const candidate = ordered[nextIdx];
    if (!candidate || candidate.user_id === bankerId) continue;

    const bal = await getCanonicalBalanceCents(candidate.user_id);
    if (bal >= required) {
      const { error: e1 } = await supabase
        .from("celo_room_players")
        .update({ role: "player" })
        .eq("room_id", roomId)
        .eq("user_id", bankerId);
      if (e1) break;

      const { error: e2 } = await supabase
        .from("celo_room_players")
        .update({ role: "banker" })
        .eq("room_id", roomId)
        .eq("user_id", candidate.user_id);
      if (e2) {
        await supabase.from("celo_room_players").update({ role: "banker" }).eq("room_id", roomId).eq("user_id", bankerId);
        break;
      }

      await supabase.from("celo_rooms").update({ banker_id: candidate.user_id }).eq("id", roomId);
      await supabase.from("celo_audit_log").insert({
        room_id: roomId,
        user_id: candidate.user_id,
        action: "banker_rotated",
        details: { from_user_id: bankerId, to_user_id: candidate.user_id },
      });
      return;
    }
  }
}
