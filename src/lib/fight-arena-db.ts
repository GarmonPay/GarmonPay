/**
 * Fight Arena — create fight, join, escrow, end match, platform revenue.
 * Uses same balance source as dashboard: getCanonicalBalanceCents + wallet_ledger_entry.
 */

import { createAdminClient } from "@/lib/supabase";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";

export type FightStatus = "open" | "active" | "completed" | "cancelled";
export type FightEscrowStatus = "held" | "released" | "refunded";

export interface FightRow {
  id: string;
  host_user_id: string;
  opponent_user_id: string | null;
  fighter1_id: string | null;
  fighter2_id: string | null;
  winner_id: string | null;
  entry_fee: number;
  platform_fee: number;
  total_pot: number;
  status: FightStatus;
  winner_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FightEscrowRow {
  id: string;
  fight_id: string;
  user_id: string;
  amount: number;
  status: FightEscrowStatus;
  created_at: string;
}

function sb() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

const PLATFORM_FEE_PERCENT = 10; // 10% of total pot when fight ends

/** Get user balance (cents). Same source as dashboard and wallet. */
async function getUserBalance(userId: string): Promise<number> {
  const balance = await getCanonicalBalanceCents(userId);
  console.log("[Fight Arena] getUserBalance", { userId, balanceCents: balance });
  return balance;
}

/** Deduct balance via wallet ledger (game_play debit). Falls back to users+transactions if RPC missing. */
async function deductBalance(
  userId: string,
  amountCents: number,
  description: string,
  referenceId: string,
  type: "fight_entry" | "fight_prize"
): Promise<boolean> {
  const ref = `fight_arena_${type}_${referenceId}_${userId}`;
  const ledgerResult = await walletLedgerEntry(userId, "game_play", -amountCents, ref);
  if (ledgerResult.success) return true;
  const { data: row } = await sb().from("users").select("balance").eq("id", userId).single();
  if (!row) return false;
  const balance = Number((row as { balance?: number }).balance ?? 0);
  if (balance < amountCents) return false;
  const { error: upErr } = await sb()
    .from("users")
    .update({
      balance: balance - amountCents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (upErr) return false;
  await sb().from("transactions").insert({
    user_id: userId,
    type,
    amount: amountCents,
    status: "completed",
    description,
    reference_id: referenceId,
  });
  await sb()
    .from("wallet_balances")
    .upsert({ user_id: userId, balance: balance - amountCents, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return true;
}

/** Credit balance via wallet ledger (game_win). Falls back to users+transactions if RPC missing. */
async function creditBalance(
  userId: string,
  amountCents: number,
  description: string,
  referenceId: string
): Promise<void> {
  const ref = `fight_arena_prize_${referenceId}_${userId}`;
  const ledgerResult = await walletLedgerEntry(userId, "game_win", amountCents, ref);
  if (ledgerResult.success) return;
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
      type: "fight_prize",
      amount: amountCents,
      status: "completed",
      description,
      reference_id: referenceId,
    });
  await sb()
    .from("wallet_balances")
    .upsert({ user_id: userId, balance: balance + amountCents, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}

/** Create a new fight (host puts entry_fee in escrow and records bet on host). Optional hostFighterId links fight to host's fighter. */
export async function createFight(
  hostUserId: string,
  entryFeeCents: number,
  hostFighterId?: string | null
): Promise<{ success: true; fight: FightRow } | { success: false; message: string }> {
  if (entryFeeCents < 100) return { success: false, message: "Minimum entry is $1.00" };
  const balance = await getUserBalance(hostUserId);
  if (balance < entryFeeCents) return { success: false, message: "Insufficient balance" };
  if (hostFighterId) {
    const { data: fighter } = await sb().from("fighters").select("id").eq("id", hostFighterId).eq("user_id", hostUserId).maybeSingle();
    if (!fighter) return { success: false, message: "Fighter not found or not yours" };
  }
  const totalPotWhenFull = entryFeeCents * 2;
  const platformFeeWhenFull = Math.round(totalPotWhenFull * (PLATFORM_FEE_PERCENT / 100));
  const { data: fight, error: fightErr } = await sb()
    .from("fights")
    .insert({
      host_user_id: hostUserId,
      opponent_user_id: null,
      fighter1_id: hostFighterId ?? null,
      fighter2_id: null,
      winner_id: null,
      entry_fee: entryFeeCents,
      platform_fee: platformFeeWhenFull,
      total_pot: entryFeeCents,
      status: "open",
      winner_user_id: null,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (fightErr || !fight) return { success: false, message: fightErr?.message ?? "Failed to create fight" };
  const ok = await deductBalance(
    hostUserId,
    entryFeeCents,
    "Fight Arena entry (host)",
    (fight as FightRow).id,
    "fight_entry"
  );
  if (!ok) {
    await sb().from("fights").delete().eq("id", (fight as FightRow).id);
    return { success: false, message: "Deduction failed" };
  }
  await sb().from("fight_escrow").insert({
    fight_id: (fight as FightRow).id,
    user_id: hostUserId,
    amount: entryFeeCents,
    status: "held",
  });
  await sb().from("fight_bets").insert({
    fight_id: (fight as FightRow).id,
    user_id: hostUserId,
    amount: entryFeeCents,
    choice: "host",
  });
  return { success: true, fight: fight as FightRow };
}

/** Join an open fight (opponent puts entry_fee in escrow). Optional opponentFighterId links fight to opponent's fighter. */
export async function joinFight(
  fightId: string,
  opponentUserId: string,
  opponentFighterId?: string | null
): Promise<{ success: true; fight: FightRow } | { success: false; message: string }> {
  const { data: fight, error: fightErr } = await sb()
    .from("fights")
    .select("*")
    .eq("id", fightId)
    .single();
  if (fightErr || !fight) return { success: false, message: "Fight not found" };
  const f = fight as FightRow;
  if (f.status !== "open") return { success: false, message: "Fight is not open" };
  if (f.host_user_id === opponentUserId) return { success: false, message: "Cannot join your own fight" };
  if (opponentFighterId) {
    const { data: fighter } = await sb().from("fighters").select("id").eq("id", opponentFighterId).eq("user_id", opponentUserId).maybeSingle();
    if (!fighter) return { success: false, message: "Fighter not found or not yours" };
  }
  const { data: existing } = await sb().from("fight_escrow").select("id").eq("fight_id", fightId).eq("user_id", opponentUserId).maybeSingle();
  if (existing) return { success: false, message: "Already joined" };
  const balance = await getUserBalance(opponentUserId);
  if (balance < f.entry_fee) return { success: false, message: "Insufficient balance" };
  const ok = await deductBalance(opponentUserId, f.entry_fee, "Fight Arena entry (opponent)", fightId, "fight_entry");
  if (!ok) return { success: false, message: "Deduction failed" };
  await sb().from("fight_escrow").insert({
    fight_id: fightId,
    user_id: opponentUserId,
    amount: f.entry_fee,
    status: "held",
  });
  const totalPot = f.entry_fee * 2;
  const platformFeeFull = Math.round(totalPot * (PLATFORM_FEE_PERCENT / 100));
  const updatePayload: Record<string, unknown> = {
    opponent_user_id: opponentUserId,
    total_pot: totalPot,
    platform_fee: platformFeeFull,
    status: "active",
    updated_at: new Date().toISOString(),
  };
  if (opponentFighterId) updatePayload.fighter2_id = opponentFighterId;
  const { error: upErr } = await sb().from("fights").update(updatePayload).eq("id", fightId);
  if (upErr) return { success: false, message: "Failed to update fight" };
  await sb().from("fight_bets").insert({
    fight_id: fightId,
    user_id: opponentUserId,
    amount: f.entry_fee,
    choice: "opponent",
  });
  const { data: updated } = await sb().from("fights").select("*").eq("id", fightId).single();
  return { success: true, fight: updated as FightRow };
}

/** End fight and pay winner (total_pot - platform_fee to winner, platform_fee to platform_revenue). Updates fighter wins/losses/earnings and pays out spectator bets. */
export async function endFight(
  fightId: string,
  winnerUserId: string,
  winnerFighterId?: string | null
): Promise<{ success: true; fight: FightRow } | { success: false; message: string }> {
  const { data: fight, error: fightErr } = await sb()
    .from("fights")
    .select("*")
    .eq("id", fightId)
    .single();
  if (fightErr || !fight) return { success: false, message: "Fight not found" };
  const f = fight as FightRow;
  if (f.status !== "active") return { success: false, message: "Fight is not active" };
  if (winnerUserId !== f.host_user_id && winnerUserId !== f.opponent_user_id) {
    return { success: false, message: "Winner must be host or opponent" };
  }
  const platformFee = Math.round(f.total_pot * (PLATFORM_FEE_PERCENT / 100));
  const winnerPayout = f.total_pot - platformFee;
  await creditBalance(winnerUserId, winnerPayout, "Fight Arena prize", fightId);

  const winnerIdToSet = winnerFighterId ?? (winnerUserId === f.host_user_id ? f.fighter1_id : f.fighter2_id);
  const loserFighterId = winnerUserId === f.host_user_id ? f.fighter2_id : f.fighter1_id;

  await sb()
    .from("fights")
    .update({
      status: "completed",
      winner_user_id: winnerUserId,
      winner_id: winnerIdToSet,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fightId);

  if (winnerIdToSet) {
    const { data: winnerFighter } = await sb().from("fighters").select("wins, earnings").eq("id", winnerIdToSet).single();
    if (winnerFighter) {
      const w = winnerFighter as { wins: number; earnings: number };
      await sb().from("fighters").update({ wins: w.wins + 1, earnings: (w.earnings ?? 0) + winnerPayout, updated_at: new Date().toISOString() }).eq("id", winnerIdToSet);
    }
  }
  if (loserFighterId) {
    const { data: loserFighter } = await sb().from("fighters").select("losses").eq("id", loserFighterId).single();
    if (loserFighter) {
      const l = loserFighter as { losses: number };
      await sb().from("fighters").update({ losses: l.losses + 1, updated_at: new Date().toISOString() }).eq("id", loserFighterId);
    }
  }

  await sb().from("fight_escrow").update({ status: "released" }).eq("fight_id", fightId).eq("user_id", winnerUserId);
  await sb().from("fight_escrow").update({ status: "refunded" }).eq("fight_id", fightId).neq("user_id", winnerUserId);
  await sb().from("platform_revenue").insert({
    amount: platformFee,
    source: "fight",
    fight_id: fightId,
    created_at: new Date().toISOString(),
  });

  const winnerChoice = winnerUserId === f.host_user_id ? "host" : "opponent";
  await sb().from("fight_bets").update({ status: "won" }).eq("fight_id", fightId).eq("choice", winnerChoice);
  await sb().from("fight_bets").update({ status: "lost" }).eq("fight_id", fightId).neq("choice", winnerChoice);

  const { data: spectatorBets } = await sb().from("bets").select("id, user_id, amount, prediction").eq("fight_id", fightId).eq("status", "pending");
  for (const bet of spectatorBets ?? []) {
    const b = bet as { id: string; user_id: string; amount: number; prediction: string };
    if (b.prediction === winnerChoice) {
      const payout = b.amount * 2;
      await creditBalance(b.user_id, payout, "Fight bet won", `bet_${b.id}`);
      await sb().from("bets").update({ status: "won" }).eq("id", b.id);
    } else {
      await sb().from("bets").update({ status: "lost" }).eq("id", b.id);
    }
  }

  const { data: updated } = await sb().from("fights").select("*").eq("id", fightId).single();
  return { success: true, fight: updated as FightRow };
}

/** Resolve fight by stats (speed + power + defense + stamina + experience/20). */
export async function runFight(fightId: string): Promise<{ success: true; fight: FightRow } | { success: false; message: string }> {
  const { data: fight, error: fightErr } = await sb().from("fights").select("*").eq("id", fightId).single();
  if (fightErr || !fight) return { success: false, message: "Fight not found" };
  const f = fight as FightRow;
  if (f.status !== "active") return { success: false, message: "Fight is not active" };
  const fighter1Id = f.fighter1_id ?? null;
  const fighter2Id = f.fighter2_id ?? null;
  let winnerUserId: string;
  let winnerFighterId: string | null = null;
  if (fighter1Id && fighter2Id) {
    const { data: f1 } = await sb().from("fighters").select("user_id, speed, power, defense, stamina, experience").eq("id", fighter1Id).single();
    const { data: f2 } = await sb().from("fighters").select("user_id, speed, power, defense, stamina, experience").eq("id", fighter2Id).single();
    if (!f1 || !f2) return { success: false, message: "Fighters not found" };
    const p1 = f1 as { speed: number; power: number; defense: number; stamina?: number; experience?: number; user_id: string };
    const p2 = f2 as { speed: number; power: number; defense: number; stamina?: number; experience?: number; user_id: string };
    const total1 = p1.speed + p1.power + p1.defense + (p1.stamina ?? 0) + Math.floor((p1.experience ?? 0) / 20);
    const total2 = p2.speed + p2.power + p2.defense + (p2.stamina ?? 0) + Math.floor((p2.experience ?? 0) / 20);
    if (total1 > total2) {
      winnerUserId = p1.user_id;
      winnerFighterId = fighter1Id;
    } else if (total2 > total1) {
      winnerUserId = p2.user_id;
      winnerFighterId = fighter2Id;
    } else {
      winnerUserId = Math.random() < 0.5 ? p1.user_id : p2.user_id;
      winnerFighterId = winnerUserId === p1.user_id ? fighter1Id : fighter2Id;
    }
  } else {
    winnerUserId = f.host_user_id;
  }
  return endFight(fightId, winnerUserId, winnerFighterId);
}

/** List fights (open, active, or all). */
export async function listFights(status?: FightStatus): Promise<FightRow[]> {
  let q = sb().from("fights").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as FightRow[];
}

/** Get single fight by id. */
export async function getFight(fightId: string): Promise<FightRow | null> {
  const { data, error } = await sb().from("fights").select("*").eq("id", fightId).maybeSingle();
  if (error || !data) return null;
  return data as FightRow;
}
