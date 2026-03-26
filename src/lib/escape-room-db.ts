/**
 * Stake & Escape — DB access via service role (tables are RLS service-only).
 */

import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

function sb() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export type EscapeMode = "free" | "stake";

export interface EscapeRoomSettingsRow {
  id: number;
  free_play_enabled: boolean;
  stake_mode_enabled: boolean;
  min_stake_cents: number;
  max_stake_cents: number;
  platform_fee_percent: number;
  top1_split_percent: number;
  top2_split_percent: number;
  top3_split_percent: number;
  countdown_seconds: number;
  daily_puzzle_rotation_enabled: boolean;
  maintenance_banner: string | null;
  suspicious_min_escape_seconds: number;
  large_payout_alert_cents: number;
  email_alert_large_payout: boolean;
  email_alert_suspicious: boolean;
  email_alert_wallet_errors: boolean;
}

export interface EscapePuzzlePublic {
  id: string;
  puzzle_name: string;
  clue_transaction_id: string;
  clue_formula: string;
  clue_terminal_text: string | null;
  clue_cabinet_text: string | null;
  difficulty_level: string;
  preview_text: string | null;
}

export interface EscapePuzzleRow extends EscapePuzzlePublic {
  correct_pin: string;
  active_date: string;
  is_active: boolean;
}

export function utcDateWindow(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function getEscapeSettings(): Promise<EscapeRoomSettingsRow | null> {
  const { data, error } = await sb()
    .from("escape_room_settings")
    .select("*")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as EscapeRoomSettingsRow;
}

export async function getPuzzleForPlay(
  settings: EscapeRoomSettingsRow,
  dayUtc: string
): Promise<EscapePuzzleRow | null> {
  let q = sb().from("escape_room_puzzles").select("*").eq("is_active", true);
  if (settings.daily_puzzle_rotation_enabled) {
    q = q.eq("active_date", dayUtc);
  }
  const { data, error } = await q.order("active_date", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data as EscapePuzzleRow;
}

export function toPublicPuzzle(row: EscapePuzzleRow): EscapePuzzlePublic {
  return {
    id: row.id,
    puzzle_name: row.puzzle_name,
    clue_transaction_id: row.clue_transaction_id,
    clue_formula: row.clue_formula,
    clue_terminal_text: row.clue_terminal_text,
    clue_cabinet_text: row.clue_cabinet_text,
    difficulty_level: row.difficulty_level,
    preview_text: row.preview_text,
  };
}

export async function getPlayerEscapeStatus(playerId: string): Promise<{
  status: string;
} | null> {
  const { data } = await sb()
    .from("escape_room_player_status")
    .select("status")
    .eq("player_id", playerId)
    .maybeSingle();
  if (!data) return null;
  return data as { status: string };
}

export async function ensurePlayerStatusRow(playerId: string): Promise<void> {
  await sb()
    .from("escape_room_player_status")
    .upsert({ player_id: playerId, status: "active" }, { onConflict: "player_id" });
}

export async function sumStakePoolForWindow(prizePoolWindow: string): Promise<number> {
  const { data, error } = await sb()
    .from("escape_room_sessions")
    .select("stake_cents")
    .eq("prize_pool_window", prizePoolWindow)
    .eq("mode", "stake");
  if (error || !data) return 0;
  return (data as { stake_cents: number }[]).reduce((s, r) => s + Number(r.stake_cents ?? 0), 0);
}

export interface WinnerRow {
  id: string;
  player_id: string;
  escape_time_seconds: number;
  started_at: string;
}

/** Stake-mode winning sessions in window, sorted by fastest escape (then started_at). */
export async function listStakeWinnersOrdered(prizePoolWindow: string): Promise<WinnerRow[]> {
  const { data, error } = await sb()
    .from("escape_room_sessions")
    .select("id, player_id, escape_time_seconds, started_at")
    .eq("prize_pool_window", prizePoolWindow)
    .eq("mode", "stake")
    .eq("result", "win")
    .not("escape_time_seconds", "is", null)
    .order("escape_time_seconds", { ascending: true })
    .order("started_at", { ascending: true });
  if (error || !data) return [];
  return data as WinnerRow[];
}

export function rankForSession(winners: WinnerRow[], sessionId: string): number {
  const idx = winners.findIndex((w) => w.id === sessionId);
  return idx < 0 ? -1 : idx + 1;
}

/** Net pool after platform fee (cents). */
export function netPoolCents(grossCents: number, feePercent: number): number {
  const net = Math.floor((grossCents * (100 - feePercent)) / 100);
  return Math.max(0, net);
}

/** Payout in cents for finish rank (1-based among stake winners that window). Top 3 paid; 4+ get 0. */
export function payoutCentsForRank(
  rank: number,
  winnerCount: number,
  netPoolCents: number,
  s1: number,
  s2: number,
  s3: number
): number {
  if (rank < 1 || rank > 3 || winnerCount < rank || netPoolCents <= 0) return 0;
  const n = Math.min(3, winnerCount);
  if (n === 1) return netPoolCents;
  let numer: number;
  let denom: number;
  if (n === 2) {
    numer = rank === 1 ? s1 : s2;
    denom = s1 + s2;
  } else {
    numer = rank === 1 ? s1 : rank === 2 ? s2 : s3;
    denom = s1 + s2 + s3;
  }
  if (denom <= 0) return 0;
  return Math.floor((netPoolCents * numer) / denom);
}

export async function logTimer(
  sessionId: string,
  eventType: "start" | "finish" | "sync" | "void" | "payout",
  payload: Record<string, unknown>
) {
  await sb().from("escape_room_timer_logs").insert({
    session_id: sessionId,
    event_type: eventType,
    payload,
  });
}

export async function creditEscapePayout(
  playerId: string,
  sessionId: string,
  cents: number
): Promise<{ ok: boolean; message?: string }> {
  if (cents <= 0) return { ok: true };
  const ref = `escape_win_${sessionId}`;
  const res = await walletLedgerEntry(playerId, "game_win", cents, ref);
  if (!res.success) return { ok: false, message: res.message };
  return { ok: true };
}
