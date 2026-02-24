/**
 * Boxing Arena — PvP entry-fee matches. Winner 90%, platform 10%.
 * All balance changes server-side with createAdminClient.
 */

import { createAdminClient } from "@/lib/supabase";

export type BoxingMatchStatus = "searching" | "pending" | "live" | "active" | "completed" | "cancelled";

export interface BoxingMatchRow {
  id: string;
  player1_id: string;
  player2_id: string | null;
  entry_fee: number;
  winner_id: string | null;
  status: BoxingMatchStatus;
  created_at: string;
  player1_health?: number;
  player2_health?: number;
  fight_seconds_elapsed?: number;
  fight_log?: unknown[];
  started_at?: string | null;
}

const PLATFORM_PERCENT = 10;
const DEFAULT_ENTRY_FEE_CENTS = 100; // $1

function sb() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

async function getUserBalance(userId: string): Promise<number> {
  const { data, error } = await sb()
    .from("users")
    .select("balance")
    .eq("id", userId)
    .single();
  if (error || !data) return 0;
  return Number((data as { balance?: number }).balance ?? 0);
}

async function deductBalance(
  userId: string,
  amountCents: number,
  description: string,
  referenceId: string,
  type: "boxing_entry" | "boxing_prize" | "boxing_bet"
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
      type: "boxing_prize",
      amount: amountCents,
      status: "completed",
      description,
      reference_id: referenceId,
    });
}

/** Enter match: join existing searching or create new. Uses escrow; when joined runs live fight then pays. */
export async function enterMatch(
  userId: string,
  entryFeeCents: number = DEFAULT_ENTRY_FEE_CENTS
): Promise<
  | { success: true; match: BoxingMatchRow; outcome: "created" | "joined" | "completed" }
  | { success: false; message: string }
> {
  if (entryFeeCents < 100) return { success: false, message: "Minimum entry is $1.00" };
  const balance = await getUserBalance(userId);
  if (balance < entryFeeCents) return { success: false, message: "Insufficient balance" };

  const { data: pending } = await sb()
    .from("boxing_matches")
    .select("*")
    .in("status", ["searching", "pending"])
    .is("player2_id", null)
    .neq("player1_id", userId)
    .eq("entry_fee", entryFeeCents)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pending) {
    const match = pending as BoxingMatchRow;
    const ok = await deductBalance(
      userId,
      entryFeeCents,
      "Boxing Arena entry",
      match.id,
      "boxing_entry"
    );
    if (!ok) return { success: false, message: "Insufficient balance" };
    const { error: escrowErr } = await sb()
      .from("boxing_escrow")
      .update({ player2_id: userId }).eq("match_id", match.id);
    if (escrowErr) {
      await creditBalance(userId, entryFeeCents, "Boxing Arena refund", match.id);
      return { success: false, message: "Failed to join match" };
    }
    const { error: upErr } = await sb()
      .from("boxing_matches")
      .update({
        player2_id: userId,
        status: "live",
        player1_health: 100,
        player2_health: 100,
        fight_seconds_elapsed: 0,
        fight_log: [],
        started_at: new Date().toISOString(),
      })
      .eq("id", match.id);
    if (upErr) {
      await creditBalance(userId, entryFeeCents, "Boxing Arena refund", match.id);
      return { success: false, message: "Failed to start match" };
    }
    const { runLiveFight } = await import("./boxing-engine");
    const { payoutMatch, resolveBets, updateBoxingProfilesAfterFight } = await import("./boxing-payouts");
    try {
      const winnerId = await runLiveFight(match.id);
      await payoutMatch(match.id, winnerId);
      await resolveBets(match.id, winnerId);
      await updateBoxingProfilesAfterFight(match.player1_id, userId, winnerId, entryFeeCents);
    } catch (e) {
      console.error("Boxing fight/payout error:", e);
    }
    const { data: updated } = await sb()
      .from("boxing_matches")
      .select("*")
      .eq("id", match.id)
      .single();
    return {
      success: true,
      match: updated as BoxingMatchRow,
      outcome: "completed",
    };
  }

  const { data: newMatch, error: insErr } = await sb()
    .from("boxing_matches")
    .insert({
      player1_id: userId,
      player2_id: null,
      entry_fee: entryFeeCents,
      winner_id: null,
      status: "searching",
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (insErr || !newMatch) return { success: false, message: insErr?.message ?? "Failed to create match" };
  const matchId = (newMatch as BoxingMatchRow).id;
  const ok = await deductBalance(userId, entryFeeCents, "Boxing Arena entry", matchId, "boxing_entry");
  if (!ok) {
    await sb().from("boxing_matches").delete().eq("id", matchId);
    return { success: false, message: "Insufficient balance" };
  }
  await sb().from("boxing_escrow").insert({
    match_id: matchId,
    player1_id: userId,
    player2_id: null,
    amount: entryFeeCents,
    created_at: new Date().toISOString(),
  });
  return {
    success: true,
    match: newMatch as BoxingMatchRow,
    outcome: "created",
  };
}

/** Get single match by id (for live page). */
export async function getBoxingMatchById(matchId: string): Promise<BoxingMatchRow | null> {
  const client = createAdminClient();
  if (!client) return null;
  const { data, error } = await client
    .from("boxing_matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (error || !data) return null;
  return data as BoxingMatchRow;
}

/** List matches that are live or searching (for "live now" list). */
export async function listLiveBoxingMatches(): Promise<BoxingMatchRow[]> {
  const client = createAdminClient();
  if (!client) return [];
  const { data, error } = await client
    .from("boxing_matches")
    .select("*")
    .in("status", ["searching", "live"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []) as BoxingMatchRow[];
}

/** List matches for a user (for history). */
export async function listUserBoxingMatches(userId: string): Promise<BoxingMatchRow[]> {
  const { data, error } = await sb()
    .from("boxing_matches")
    .select("*")
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []) as BoxingMatchRow[];
}

/** Get wins, losses, total earnings for a user from boxing. */
export async function getBoxingStats(userId: string): Promise<{
  wins: number;
  losses: number;
  earningsCents: number;
}> {
  const matches = await listUserBoxingMatches(userId);
  let wins = 0;
  let losses = 0;
  let earningsCents = 0;
  for (const m of matches) {
    if (m.status !== "completed") continue;
    const isPlayer1 = m.player1_id === userId;
    const isPlayer2 = m.player2_id === userId;
    if (!isPlayer1 && !isPlayer2) continue;
    const won = m.winner_id === userId;
    if (won) {
      wins++;
      earningsCents += Math.round(m.entry_fee * 2 * 0.9) - Number(m.entry_fee);
    } else {
      losses++;
      earningsCents -= Number(m.entry_fee);
    }
  }
  return { wins, losses, earningsCents };
}

/** Place bet on a live match. Returns error if match not live or insufficient balance. */
export async function placeBet(
  userId: string,
  matchId: string,
  betOnPlayerId: string,
  amountCents: number
): Promise<{ success: true } | { success: false; message: string }> {
  if (amountCents < 50) return { success: false, message: "Minimum bet is $0.50" };
  const match = await getBoxingMatchById(matchId);
  if (!match) return { success: false, message: "Match not found" };
  if (match.status !== "live" && match.status !== "searching") return { success: false, message: "Betting closed" };
  if (match.player1_id !== betOnPlayerId && match.player2_id !== betOnPlayerId) {
    return { success: false, message: "Invalid player" };
  }
  const balance = await getUserBalance(userId);
  if (balance < amountCents) return { success: false, message: "Insufficient balance" };
  const ok = await deductBalance(userId, amountCents, "Boxing bet", matchId, "boxing_bet");
  if (!ok) return { success: false, message: "Insufficient balance" };
  await sb().from("boxing_bets").insert({
    match_id: matchId,
    user_id: userId,
    bet_on_player_id: betOnPlayerId,
    amount: amountCents,
    payout: 0,
    status: "pending",
    created_at: new Date().toISOString(),
  });
  return { success: true };
}

/** List open boxing tournaments. */
export async function listBoxingTournaments(): Promise<{ id: string; name: string; entry_fee: number; max_players: number; prize_pool: number; status: string }[]> {
  const client = createAdminClient();
  if (!client) return [];
  const { data, error } = await client
    .from("boxing_tournaments")
    .select("id, name, entry_fee, max_players, prize_pool, status")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []) as { id: string; name: string; entry_fee: number; max_players: number; prize_pool: number; status: string }[];
}
