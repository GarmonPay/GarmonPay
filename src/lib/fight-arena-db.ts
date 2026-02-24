/**
 * Fight Arena — create fight, join, escrow, end match, platform revenue.
 * All balance changes server-side with createAdminClient.
 */

import { createAdminClient } from "@/lib/supabase";

export type FightStatus = "open" | "active" | "completed" | "cancelled";
export type FightEscrowStatus = "held" | "released" | "refunded";

export interface FightRow {
  id: string;
  host_user_id: string;
  opponent_user_id: string | null;
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

/** Get user balance (cents). */
async function getUserBalance(userId: string): Promise<number> {
  const { data, error } = await sb()
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();
  if (error || !data) return 0;
  return Number((data as { balance?: number }).balance ?? 0);
}

/** Deduct balance and record transaction. Returns false if insufficient. */
async function deductBalance(
  userId: string,
  amountCents: number,
  description: string,
  referenceId: string,
  type: "fight_entry" | "fight_prize"
): Promise<boolean> {
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
  return true;
}

/** Credit balance and record transaction. */
async function creditBalance(
  userId: string,
  amountCents: number,
  description: string,
  referenceId: string
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
      type: "fight_prize",
      amount: amountCents,
      status: "completed",
      description,
      reference_id: referenceId,
    });
}

/** Create a new fight (host puts entry_fee in escrow and records bet on host). */
export async function createFight(
  hostUserId: string,
  entryFeeCents: number
): Promise<{ success: true; fight: FightRow } | { success: false; message: string }> {
  if (entryFeeCents < 100) return { success: false, message: "Minimum entry is $1.00" };
  const balance = await getUserBalance(hostUserId);
  if (balance < entryFeeCents) return { success: false, message: "Insufficient balance" };
  const totalPotWhenFull = entryFeeCents * 2;
  const platformFeeWhenFull = Math.round(totalPotWhenFull * (PLATFORM_FEE_PERCENT / 100));
  const { data: fight, error: fightErr } = await sb()
    .from("fights")
    .insert({
      host_user_id: hostUserId,
      opponent_user_id: null,
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

/** Join an open fight (opponent puts entry_fee in escrow). */
export async function joinFight(
  fightId: string,
  opponentUserId: string
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
  const { error: upErr } = await sb()
    .from("fights")
    .update({
      opponent_user_id: opponentUserId,
      total_pot: totalPot,
      platform_fee: platformFeeFull,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", fightId);
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

/** End fight and pay winner (total_pot - platform_fee to winner, platform_fee to platform_revenue). */
export async function endFight(
  fightId: string,
  winnerUserId: string
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
  await sb()
    .from("fight_escrow")
    .update({ status: "released" })
    .eq("fight_id", fightId)
    .eq("user_id", winnerUserId);
  await sb()
    .from("fight_escrow")
    .update({ status: "refunded" })
    .eq("fight_id", fightId)
    .neq("user_id", winnerUserId);
  await sb().from("platform_revenue").insert({
    amount: platformFee,
    source: "fight",
    fight_id: fightId,
    created_at: new Date().toISOString(),
  });
  const { error: upErr } = await sb()
    .from("fights")
    .update({
      status: "completed",
      winner_user_id: winnerUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fightId);
  if (upErr) return { success: false, message: "Failed to complete fight" };
  const { data: updated } = await sb().from("fights").select("*").eq("id", fightId).single();
  return { success: true, fight: updated as FightRow };
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
