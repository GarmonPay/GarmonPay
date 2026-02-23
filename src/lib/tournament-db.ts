/**
 * Profit-safe tournaments. Prize pool from entry fees only.
 * Uses core/payments getBalance for checks; balance deduct/credit via Supabase (core has no deduct/credit).
 */

import { createAdminClient } from "@/lib/supabase";
import { getBalance } from "@/core/payments";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export type TournamentStatus = "upcoming" | "active" | "ended";

export interface TournamentRow {
  id: string;
  name: string;
  entry_fee: number;
  prize_pool: number;
  platform_profit: number;
  reserve_balance: number;
  start_date: string;
  end_date: string;
  status: TournamentStatus;
  created_at: string;
}

export interface TournamentPlayerRow {
  id: string;
  tournament_id: string;
  user_id: string;
  score: number;
  joined_at: string;
}

/** List tournaments by status (default: active + upcoming). */
export async function listTournaments(statuses: TournamentStatus[] = ["active", "upcoming"]): Promise<TournamentRow[]> {
  const { data, error } = await supabase()
    .from("tournaments")
    .select("*")
    .in("status", statuses)
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    entry_fee: Number(r.entry_fee ?? 0),
    prize_pool: Number(r.prize_pool ?? 0),
    platform_profit: Number(r.platform_profit ?? 0),
    reserve_balance: Number(r.reserve_balance ?? 0),
    start_date: r.start_date as string,
    end_date: r.end_date as string,
    status: r.status as TournamentStatus,
    created_at: r.created_at as string,
  }));
}

/** Get one tournament. */
export async function getTournament(id: string): Promise<TournamentRow | null> {
  const { data, error } = await supabase().from("tournaments").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    name: r.name as string,
    entry_fee: Number(r.entry_fee ?? 0),
    prize_pool: Number(r.prize_pool ?? 0),
    platform_profit: Number(r.platform_profit ?? 0),
    reserve_balance: Number(r.reserve_balance ?? 0),
    start_date: r.start_date as string,
    end_date: r.end_date as string,
    status: r.status as TournamentStatus,
    created_at: r.created_at as string,
  };
}

/** Join tournament: deduct entry_fee; split 60% prize_pool, 30% platform_profit, 10% reserve_balance. */
export async function joinTournament(
  userId: string,
  tournamentId: string
): Promise<{ success: boolean; message?: string }> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { success: false, message: "Tournament not found" };
  if (tournament.status !== "active" && tournament.status !== "upcoming") return { success: false, message: "Tournament not open for join" };
  const entryCents = Math.round(Number(tournament.entry_fee) * 100);
  if (entryCents > 0) {
    const balance = await getBalance(userId);
    if (balance < entryCents) return { success: false, message: "Insufficient balance" };
    const sb = supabase();
    const { data: userRow, error: userErr } = await sb.from("users").select("balance").eq("id", userId).single();
    if (userErr || !userRow) return { success: false, message: "User not found" };
    const currentBalance = Number((userRow as { balance?: number }).balance ?? 0);
    if (currentBalance < entryCents) return { success: false, message: "Insufficient balance" };
    await sb.from("users").update({
      balance: currentBalance - entryCents,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);
    await sb.from("transactions").insert({
      user_id: userId,
      type: "tournament_entry",
      amount: entryCents,
      status: "completed",
      description: `Entry fee: ${tournament.name}`,
    });
    const toPrizeCents = Math.floor(entryCents * 0.6);
    const toPlatformCents = Math.floor(entryCents * 0.3);
    const toReserveCents = entryCents - toPrizeCents - toPlatformCents;
    await sb.from("tournaments").update({
      prize_pool: Number(tournament.prize_pool) + toPrizeCents / 100,
      platform_profit: Number(tournament.platform_profit) + toPlatformCents / 100,
      reserve_balance: Number(tournament.reserve_balance) + toReserveCents / 100,
      updated_at: new Date().toISOString(),
    }).eq("id", tournamentId);
  }
  const { error: insertErr } = await supabase().from("tournament_players").insert({
    tournament_id: tournamentId,
    user_id: userId,
    score: 0,
  });
  if (insertErr) {
    if (insertErr.code === "23505") return { success: false, message: "Already joined" };
    return { success: false, message: insertErr.message };
  }
  return { success: true };
}

/** Leaderboard: players by score DESC with rank and prize position. */
export async function getTournamentLeaderboard(tournamentId: string): Promise<
  { rank: number; user_id: string; email: string; score: number; prizePosition: number | null }[]
> {
  const { data: players, error } = await supabase()
    .from("tournament_players")
    .select("user_id, score")
    .eq("tournament_id", tournamentId)
    .order("score", { ascending: false });
  if (error) throw error;
  const list = (players ?? []) as { user_id: string; score: number }[];
  const userIds = list.map((p) => p.user_id);
  const emails = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users } = await supabase().from("users").select("id, email").in("id", userIds);
    (users ?? []).forEach((u: { id: string; email: string }) => emails.set(u.id, u.email));
  }
  return list.map((p, i) => ({
    rank: i + 1,
    user_id: p.user_id,
    email: emails.get(p.user_id) ?? "—",
    score: Number(p.score),
    prizePosition: i < 3 ? i + 1 : null,
  }));
}

/** Check if user is in tournament. */
export async function isPlayerInTournament(userId: string, tournamentId: string): Promise<boolean> {
  const { data } = await supabase()
    .from("tournament_players")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Update player score (server-side only; call from verified actions or admin). */
export async function updatePlayerScore(
  tournamentId: string,
  userId: string,
  scoreDelta: number
): Promise<{ success: boolean; message?: string }> {
  const { data: row } = await supabase()
    .from("tournament_players")
    .select("score")
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .single();
  if (!row) return { success: false, message: "Not a player" };
  const newScore = Math.max(0, Number((row as { score: number }).score) + scoreDelta);
  const { error } = await supabase()
    .from("tournament_players")
    .update({ score: newScore })
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId);
  if (error) return { success: false, message: error.message };
  const { refreshTeamTotalScoreForUser } = await import("@/lib/team-db");
  await refreshTeamTotalScoreForUser(userId);
  return { success: true };
}

/** End tournament and distribute prizes: 1st 50%, 2nd 30%, 3rd 20%. */
export async function endTournamentAndDistributePrizes(tournamentId: string): Promise<{ success: boolean; message?: string }> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { success: false, message: "Tournament not found" };
  if (tournament.status === "ended") return { success: false, message: "Already ended" };
  const leaderboard = await getTournamentLeaderboard(tournamentId);
  const prizePoolCents = Math.round(Number(tournament.prize_pool) * 100);
  const shares = [0.5, 0.3, 0.2];
  const sb = supabase();
  for (let i = 0; i < Math.min(3, leaderboard.length); i++) {
    const amountCents = Math.floor(prizePoolCents * shares[i]);
    if (amountCents <= 0) continue;
    const userId = leaderboard[i].user_id;
    const { data: userRow } = await sb.from("users").select("balance").eq("id", userId).single();
    if (!userRow) continue;
    const balance = Number((userRow as { balance?: number }).balance ?? 0);
    await sb.from("users").update({
      balance: balance + amountCents,
      updated_at: new Date().toISOString(),
    }).eq("id", userId);
    await sb.from("transactions").insert({
      user_id: userId,
      type: "tournament_prize",
      amount: amountCents,
      status: "completed",
      description: `Tournament "${tournament.name}" — ${i + 1}st place`,
    });
  }
  await sb.from("tournaments").update({
    status: "ended",
    prize_pool: 0,
    updated_at: new Date().toISOString(),
  }).eq("id", tournamentId);
  return { success: true };
}

/** Admin: create tournament. */
export async function createTournament(params: {
  name: string;
  entry_fee: number;
  prize_pool: number;
  start_date: string;
  end_date: string;
}): Promise<TournamentRow> {
  const { data, error } = await supabase().from("tournaments").insert({
    name: params.name,
    entry_fee: params.entry_fee,
    prize_pool: params.prize_pool,
    platform_profit: 0,
    reserve_balance: 0,
    start_date: params.start_date,
    end_date: params.end_date,
    status: "upcoming",
  }).select().single();
  if (error) throw error;
  return data as TournamentRow;
}

/** Admin: update tournament. */
export async function updateTournament(
  id: string,
  updates: Partial<{ name: string; entry_fee: number; prize_pool: number; start_date: string; end_date: string; status: TournamentStatus }>
): Promise<void> {
  const { error } = await supabase().from("tournaments").update(updates).eq("id", id);
  if (error) throw error;
}

/** Admin: set tournament status to ended and distribute prizes. */
export async function endTournament(id: string): Promise<{ success: boolean; message?: string }> {
  return endTournamentAndDistributePrizes(id);
}

/** Admin: list all tournaments. */
export async function listAllTournaments(): Promise<TournamentRow[]> {
  const { data, error } = await supabase()
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    entry_fee: Number(r.entry_fee ?? 0),
    prize_pool: Number(r.prize_pool ?? 0),
    platform_profit: Number(r.platform_profit ?? 0),
    reserve_balance: Number(r.reserve_balance ?? 0),
    start_date: r.start_date as string,
    end_date: r.end_date as string,
    status: r.status as TournamentStatus,
    created_at: r.created_at as string,
  }));
}
