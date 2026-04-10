import type { SupabaseClient } from "@supabase/supabase-js";
import { celoWalletCredit } from "@/lib/celo-payout-ledger";

/** Settle open side bets for a completed or abandoned round. */
export async function settleCeloOpenSideBets(
  supabase: SupabaseClient,
  roundId: string,
  roomId: string
): Promise<void> {
  const { data: openBets } = await supabase
    .from("celo_side_bets")
    .select("*")
    .eq("round_id", roundId)
    .in("status", ["open", "matched", "locked"]);

  if (!openBets || openBets.length === 0) return;

  for (const bet of openBets as {
    id: string;
    creator_id: string;
    acceptor_id: string | null;
    amount_cents: number;
    status: string;
  }[]) {
    if (bet.status === "open") {
      await celoWalletCredit(
        supabase,
        bet.creator_id,
        bet.amount_cents,
        `celo_sidebet_refund_${bet.id}`
      );
      await supabase
        .from("celo_side_bets")
        .update({ status: "cancelled", settled_at: new Date().toISOString() })
        .eq("id", bet.id);
    } else if (bet.acceptor_id) {
      await Promise.all([
        celoWalletCredit(
          supabase,
          bet.creator_id,
          bet.amount_cents,
          `celo_sidebet_refund_${bet.id}_creator`
        ),
        celoWalletCredit(
          supabase,
          bet.acceptor_id,
          bet.amount_cents,
          `celo_sidebet_refund_${bet.id}_acceptor`
        ),
      ]);
      await supabase
        .from("celo_side_bets")
        .update({ status: "cancelled", settled_at: new Date().toISOString() })
        .eq("id", bet.id);
    }
  }
}
