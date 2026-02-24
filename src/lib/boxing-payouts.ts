/**
 * Boxing payouts: escrow → winner 90%, platform 10%. Bets: winners paid, platform 5%.
 * All server-side.
 */

import { createAdminClient } from "@/lib/supabase";
import { ensureBoxingProfile } from "./boxing-engine";

function sb() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

async function creditBalance(
  userId: string,
  amountCents: number,
  description: string,
  referenceId: string,
  type: "boxing_prize" | "boxing_bet_payout"
): Promise<void> {
  const { data: row } = await sb().from("users").select("balance").eq("id", userId).single();
  const balance = row ? Number((row as { balance?: number }).balance ?? 0) : 0;
  await sb()
    .from("users")
    .update({
      balance: balance + amountCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  await sb()
    .from("transactions")
    .insert({
      user_id: userId,
      type,
      amount: amountCents,
      status: "completed",
      description,
      reference_id: referenceId,
    });
}

/** Pay out match: winner 90%, platform 10% from escrow. */
export async function payoutMatch(matchId: string, winnerId: string): Promise<void> {
  const { data: escrow } = await sb()
    .from("boxing_escrow")
    .select("amount, player1_id, player2_id")
    .eq("match_id", matchId)
    .single();
  if (!escrow) return;
  const amount = Number((escrow as { amount: number }).amount);
  const pool = amount * 2;
  const winnerShare = Math.round(pool * 0.9);
  const platformShare = pool - winnerShare;
  await creditBalance(winnerId, winnerShare, "Boxing Arena prize", matchId, "boxing_prize");
  await sb().from("platform_revenue").insert({
    amount: platformShare,
    source: "boxing",
    boxing_match_id: matchId,
    created_at: new Date().toISOString(),
  });
}

/** Resolve all bets for match: winning bettors get share of (loser pool - 5%); platform 5%. */
export async function resolveBets(matchId: string, winnerId: string): Promise<void> {
  const { data: bets } = await sb()
    .from("boxing_bets")
    .select("id, user_id, bet_on_player_id, amount, status")
    .eq("match_id", matchId)
    .eq("status", "pending");
  if (!bets || bets.length === 0) return;
  const rows = bets as { id: string; user_id: string; bet_on_player_id: string; amount: number }[];
  let totalOnWinner = 0;
  let totalOnLoser = 0;
  const winnerBets: { id: string; user_id: string; amount: number }[] = [];
  for (const b of rows) {
    const amt = Number(b.amount);
    if (b.bet_on_player_id === winnerId) {
      totalOnWinner += amt;
      winnerBets.push({ id: b.id, user_id: b.user_id, amount: amt });
    } else {
      totalOnLoser += amt;
    }
  }
  const platformFee = Math.round(totalOnLoser * 0.05);
  const poolToWinners = totalOnLoser - platformFee;
  if (totalOnWinner > 0 && poolToWinners > 0) {
    for (const b of winnerBets) {
      const share = Math.round((b.amount / totalOnWinner) * poolToWinners);
      const payout = b.amount + share;
      await creditBalance(b.user_id, payout, "Boxing bet payout", matchId, "boxing_bet_payout");
      await sb().from("boxing_bets").update({ status: "won", payout }).eq("id", b.id);
    }
  }
  for (const b of rows) {
    if (b.bet_on_player_id !== winnerId) {
      await sb().from("boxing_bets").update({ status: "lost", payout: 0 }).eq("id", b.id);
    }
  }
  if (platformFee > 0) {
    await sb().from("platform_revenue").insert({
      amount: platformFee,
      source: "boxing_bets",
      created_at: new Date().toISOString(),
    });
  }
}

/** Update boxing_profiles after fight: wins, losses, earnings, level. */
export async function updateBoxingProfilesAfterFight(
  player1Id: string,
  player2Id: string,
  winnerId: string,
  entryFeeCents: number
): Promise<void> {
  const winnerEarnings = Math.round(entryFeeCents * 2 * 0.9) - entryFeeCents;
  const loserEarnings = -entryFeeCents;
  await ensureBoxingProfile(player1Id);
  await ensureBoxingProfile(player2Id);

  const update = async (userId: string, won: boolean, earningsDelta: number, knockout: boolean) => {
    const { data: p } = await sb()
      .from("boxing_profiles")
      .select("wins, losses, knockouts, earnings, level")
      .eq("user_id", userId)
      .single();
    if (!p) return;
    const row = p as { wins: number; losses: number; knockouts: number; earnings: number; level: number };
    const wins = row.wins + (won ? 1 : 0);
    const losses = row.losses + (won ? 0 : 1);
    const knockouts = row.knockouts + (knockout && won ? 1 : 0);
    const earnings = row.earnings + earningsDelta;
    const level = Math.min(99, 1 + Math.floor(wins / 5) + Math.floor(earnings / 5000));
    await sb()
      .from("boxing_profiles")
      .update({
        wins,
        losses,
        knockouts,
        earnings,
        level,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  };

  const p1Won = winnerId === player1Id;
  await update(player1Id, p1Won, p1Won ? winnerEarnings : loserEarnings, false);
  await update(player2Id, !p1Won, !p1Won ? winnerEarnings : loserEarnings, false);
}
