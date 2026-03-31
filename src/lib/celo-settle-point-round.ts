import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePayout } from "@/lib/celo-engine";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

export async function settlePointRound(
  supabase: SupabaseClient,
  roomId: string,
  bankerId: string,
  round: {
    id: string;
    total_pot_cents: number;
    platform_fee_cents: number;
    platform_fee_pct?: number;
  },
  winnerClaims: { userId: string; betCents: number }[]
): Promise<{ ok: boolean; error?: string }> {
  const feePct = Number(round.platform_fee_pct ?? 10);
  const netPot = round.total_pot_cents - round.platform_fee_cents;
  if (netPot < 0) {
    return { ok: false, error: "Invalid pot" };
  }

  const claims = winnerClaims.map((w) => ({
    userId: w.userId,
    betCents: w.betCents,
    netPayout: calculatePayout(w.betCents, feePct).netPayout,
  }));

  const totalClaim = claims.reduce((s, c) => s + c.netPayout, 0);

  if (claims.length === 0) {
    const ref = `celo_round_${round.id}_banker_sweep`;
    const w = await walletLedgerEntry(bankerId, "game_win", netPot, ref);
    if (!w.success) return { ok: false, error: w.message };
  } else if (totalClaim <= netPot) {
    for (const c of claims) {
      const ref = `celo_round_${round.id}_win_${c.userId}`;
      const w = await walletLedgerEntry(c.userId, "game_win", c.netPayout, ref);
      if (!w.success) return { ok: false, error: w.message };
      await supabase
        .from("celo_player_rolls")
        .update({ payout_cents: c.netPayout })
        .eq("round_id", round.id)
        .eq("user_id", c.userId);
    }
    const bankerGets = netPot - totalClaim;
    if (bankerGets > 0) {
      const w = await walletLedgerEntry(bankerId, "game_win", bankerGets, `celo_round_${round.id}_banker_remainder`);
      if (!w.success) return { ok: false, error: w.message };
    }
  } else {
    let paid = 0;
    for (let i = 0; i < claims.length; i++) {
      const c = claims[i];
      let pay: number;
      if (i === claims.length - 1) {
        pay = netPot - paid;
      } else {
        pay = Math.floor((netPot * c.netPayout) / totalClaim);
        paid += pay;
      }
      if (pay > 0) {
        const w = await walletLedgerEntry(c.userId, "game_win", pay, `celo_round_${round.id}_win_${c.userId}_prorata`);
        if (!w.success) return { ok: false, error: w.message };
        await supabase
          .from("celo_player_rolls")
          .update({ payout_cents: pay })
          .eq("round_id", round.id)
          .eq("user_id", c.userId);
      }
    }
  }

  await supabase
    .from("celo_rounds")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", round.id);

  await supabase
    .from("celo_rooms")
    .update({ status: "active", last_activity: new Date().toISOString() })
    .eq("id", roomId);

  return { ok: true };
}
