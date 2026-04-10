import type { SupabaseClient } from "@supabase/supabase-js";
import { celoPlayerStakeCents } from "@/lib/celo-player-stake";

export type EligibleStakedPlayer = {
  user_id: string;
  bet_cents: number;
  seat_number: number | null;
};

function playerBetCents(row: { bet_cents?: number; entry_sc?: number }): number {
  return celoPlayerStakeCents(row);
}

/** Players who roll vs the banker this round (seat order), with stake > 0. */
export async function getEligibleStakedPlayers(
  supabase: SupabaseClient,
  roomId: string,
  coveredBy: string | null
): Promise<EligibleStakedPlayer[]> {
  let q = supabase
    .from("celo_room_players")
    .select("user_id, bet_cents, entry_sc, seat_number")
    .eq("room_id", roomId)
    .eq("role", "player")
    .order("seat_number", { ascending: true });

  if (coveredBy) {
    q = q.eq("user_id", coveredBy);
  }

  const { data: players } = await q;
  const rows = (players ?? []) as {
    user_id: string;
    bet_cents?: number;
    entry_sc?: number;
    seat_number: number | null;
  }[];
  return rows
    .filter((p) => playerBetCents(p) > 0)
    .map((p) => ({
      user_id: p.user_id,
      bet_cents: playerBetCents(p),
      seat_number: p.seat_number,
    }));
}
