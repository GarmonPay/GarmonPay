import { createAdminClient } from "@/lib/supabase";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";

export type EscapeMode = "free" | "stake";
export type EscapeResult = "active" | "win" | "lose" | "timeout" | "voided";
export type EscapePayoutStatus = "none" | "pending" | "paid" | "rejected" | "voided" | "failed";

type SettingsRow = {
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
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type PuzzleRow = {
  id: string;
  puzzle_name: string;
  clue_transaction_id: string;
  clue_formula: string;
  clue_terminal_text: string | null;
  clue_cabinet_text: string | null;
  correct_pin: string;
  difficulty_level: "easy" | "medium" | "hard" | "expert";
  active_date: string;
  is_active: boolean;
  preview_text: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  player_id: string;
  mode: EscapeMode;
  stake_cents: number;
  started_at: string;
  ended_at: string | null;
  countdown_seconds: number;
  server_elapsed_seconds: number | null;
  escape_time_seconds: number | null;
  result: EscapeResult;
  timer_valid: boolean | null;
  puzzle_id: string | null;
  puzzle_progress: Record<string, unknown>;
  entered_pin: string | null;
  prize_pool_window: string;
  platform_fee_cents: number;
  projected_payout_cents: number;
  payout_cents: number;
  payout_status: EscapePayoutStatus;
  payout_reference: string | null;
  suspicious: boolean;
  suspicious_reason: string | null;
  ip_address: string | null;
  device_fingerprint: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type PayoutRow = {
  id: string;
  session_id: string;
  player_id: string;
  amount_cents: number;
  status: "pending" | "approved" | "rejected" | "paid" | "failed" | "voided";
  error_message: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export interface EscapeStartInput {
  userId: string;
  mode: EscapeMode;
  stakeCents?: number;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  userAgent?: string | null;
}

export interface EscapeFinishInput {
  userId: string;
  sessionId: string;
  enteredPin: string;
  terminalFound: boolean;
  cabinetFound: boolean;
  keypadSolved: boolean;
  inventory?: string[];
  clientMeta?: Record<string, unknown>;
}

export interface EscapeWindowStanding {
  sessionId: string;
  userId: string;
  rank: number;
  escapeTimeSeconds: number;
  projectedPayoutCents: number;
}

function admin() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

function hourWindowKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hour = `${date.getUTCHours()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:00Z`;
}

function toCents(value: number): number {
  return Math.max(0, Math.round(Number(value) || 0));
}

function payoutSplitAmounts(totalCents: number, settings: SettingsRow): [number, number, number] {
  const raw = [
    Number(settings.top1_split_percent) || 50,
    Number(settings.top2_split_percent) || 30,
    Number(settings.top3_split_percent) || 20,
  ];
  const sum = raw[0] + raw[1] + raw[2];
  const normalized = sum > 0 ? raw.map((v) => v / sum) : [0.5, 0.3, 0.2];
  const p1 = Math.floor(totalCents * normalized[0]);
  const p2 = Math.floor(totalCents * normalized[1]);
  const p3 = Math.max(0, totalCents - p1 - p2);
  return [p1, p2, p3];
}

export async function getEscapeRoomSettings(): Promise<SettingsRow> {
  const { data, error } = await admin()
    .from("escape_room_settings")
    .select("*")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Escape room settings not found");
  }
  return data as SettingsRow;
}

export async function updateEscapeRoomSettings(
  updates: Partial<Pick<
    SettingsRow,
    | "free_play_enabled"
    | "stake_mode_enabled"
    | "min_stake_cents"
    | "max_stake_cents"
    | "platform_fee_percent"
    | "top1_split_percent"
    | "top2_split_percent"
    | "top3_split_percent"
    | "countdown_seconds"
    | "daily_puzzle_rotation_enabled"
    | "maintenance_banner"
    | "suspicious_min_escape_seconds"
    | "large_payout_alert_cents"
    | "email_alert_large_payout"
    | "email_alert_suspicious"
    | "email_alert_wallet_errors"
  >>,
  adminId: string
): Promise<SettingsRow> {
  const current = await getEscapeRoomSettings();
  const { data, error } = await admin()
    .from("escape_room_settings")
    .update({ ...updates, updated_by: adminId })
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as SettingsRow;
}

export async function getActivePuzzle(): Promise<PuzzleRow> {
  const today = new Date().toISOString().slice(0, 10);
  const byDate = await admin()
    .from("escape_room_puzzles")
    .select("*")
    .eq("is_active", true)
    .eq("active_date", today)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byDate.data) return byDate.data as PuzzleRow;

  const fallback = await admin()
    .from("escape_room_puzzles")
    .select("*")
    .eq("is_active", true)
    .order("active_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallback.error || !fallback.data) {
    throw new Error(fallback.error?.message ?? "No active puzzle configured");
  }
  return fallback.data as PuzzleRow;
}

export async function listPuzzles(limit = 200): Promise<PuzzleRow[]> {
  const { data, error } = await admin()
    .from("escape_room_puzzles")
    .select("*")
    .order("active_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PuzzleRow[];
}

export async function upsertPuzzle(
  input: {
    id?: string;
    puzzle_name: string;
    clue_transaction_id: string;
    clue_formula: string;
    clue_terminal_text?: string | null;
    clue_cabinet_text?: string | null;
    correct_pin: string;
    difficulty_level: PuzzleRow["difficulty_level"];
    active_date: string;
    is_active: boolean;
    preview_text?: string | null;
  },
  adminId: string
): Promise<PuzzleRow> {
  if (!/^\d{4}$/.test(input.correct_pin)) {
    throw new Error("PIN must be 4 digits");
  }
  if (input.id) {
    const { data, error } = await admin()
      .from("escape_room_puzzles")
      .update({
        ...input,
        updated_by: adminId,
      })
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as PuzzleRow;
  }
  const { data, error } = await admin()
    .from("escape_room_puzzles")
    .insert({
      ...input,
      created_by: adminId,
      updated_by: adminId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PuzzleRow;
}

async function getUserForGame(userId: string): Promise<{
  id: string;
  role: string | null;
  kyc_verified: boolean;
  banned: boolean;
  email: string | null;
}> {
  const { data, error } = await admin()
    .from("users")
    .select("id, role, kyc_verified, banned, email")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "User not found");
  const row = data as {
    id: string;
    role?: string | null;
    kyc_verified?: boolean | null;
    banned?: boolean | null;
    email?: string | null;
  };
  return {
    id: row.id,
    role: row.role ?? null,
    kyc_verified: !!row.kyc_verified,
    banned: !!row.banned,
    email: row.email ?? null,
  };
}

export async function startEscapeSession(input: EscapeStartInput): Promise<{
  session: SessionRow;
  puzzle: Omit<PuzzleRow, "correct_pin">;
  walletBalanceCents: number;
}> {
  const settings = await getEscapeRoomSettings();
  const player = await getUserForGame(input.userId);
  if (player.banned) throw new Error("Account is banned");

  const mode = input.mode;
  if (mode === "free" && !settings.free_play_enabled) {
    throw new Error("Free Play is currently disabled");
  }
  if (mode === "stake" && !settings.stake_mode_enabled) {
    throw new Error("Stake Mode is currently disabled");
  }

  const statusRow = await admin()
    .from("escape_room_player_status")
    .select("status")
    .eq("player_id", input.userId)
    .maybeSingle();
  const playerStatus = (statusRow.data as { status?: string } | null)?.status;
  if (playerStatus === "banned" || playerStatus === "suspended") {
    throw new Error("You are not allowed to play Stake & Escape");
  }

  const stakeCents = mode === "stake" ? toCents(input.stakeCents ?? 0) : 0;
  if (mode === "stake") {
    if (!player.kyc_verified) throw new Error("KYC verification required for Stake Mode");
    if (stakeCents < settings.min_stake_cents || stakeCents > settings.max_stake_cents) {
      throw new Error(
        `Stake must be between $${(settings.min_stake_cents / 100).toFixed(2)} and $${(
          settings.max_stake_cents / 100
        ).toFixed(2)}`
      );
    }
    const balance = await getCanonicalBalanceCents(input.userId);
    if (balance < stakeCents) throw new Error("Insufficient wallet balance");
  }

  const puzzle = await getActivePuzzle();
  const insertPayload = {
    player_id: input.userId,
    mode,
    stake_cents: stakeCents,
    countdown_seconds: settings.countdown_seconds,
    puzzle_id: puzzle.id,
    puzzle_progress: { terminalFound: false, cabinetFound: false, keypadSolved: false },
    prize_pool_window: hourWindowKey(new Date()),
    ip_address: input.ipAddress ?? null,
    device_fingerprint: input.deviceFingerprint ?? null,
    user_agent: input.userAgent ?? null,
  };

  const created = await admin()
    .from("escape_room_sessions")
    .insert(insertPayload)
    .select("*")
    .single();
  if (created.error || !created.data) {
    throw new Error(created.error?.message ?? "Failed to create game session");
  }
  const session = created.data as SessionRow;

  if (mode === "stake" && stakeCents > 0) {
    const reference = `escape_stake_${session.id}`;
    const debit = await walletLedgerEntry(input.userId, "game_play", -stakeCents, reference);
    if (!debit.success) {
      await admin().from("escape_room_sessions").delete().eq("id", session.id);
      throw new Error(debit.message);
    }
  }

  await admin().from("escape_room_timer_logs").insert({
    session_id: session.id,
    event_type: "start",
    payload: {
      mode,
      stakeCents,
      startedAt: session.started_at,
    },
  });

  const walletBalanceCents = await getCanonicalBalanceCents(input.userId);
  const { correct_pin: _secretPin, ...safePuzzle } = puzzle;
  return {
    session,
    puzzle: safePuzzle,
    walletBalanceCents,
  };
}

async function updateWindowPayouts(prizePoolWindow: string, settings: SettingsRow) {
  const sessionsRes = await admin()
    .from("escape_room_sessions")
    .select("*")
    .eq("mode", "stake")
    .eq("prize_pool_window", prizePoolWindow)
    .neq("result", "voided")
    .order("started_at", { ascending: true });
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);

  const allSessions = (sessionsRes.data ?? []) as SessionRow[];
  const totalStake = allSessions.reduce((sum, row) => sum + toCents(row.stake_cents), 0);
  const platformFeeCents = Math.floor(totalStake * ((Number(settings.platform_fee_percent) || 0) / 100));
  const distributableCents = Math.max(0, totalStake - platformFeeCents);

  const winners = allSessions
    .filter((s) => s.result === "win" && s.timer_valid === true && (s.escape_time_seconds ?? 0) > 0)
    .sort((a, b) => {
      const diff = (a.escape_time_seconds ?? 10_000) - (b.escape_time_seconds ?? 10_000);
      return diff !== 0 ? diff : +new Date(a.ended_at ?? a.started_at) - +new Date(b.ended_at ?? b.started_at);
    })
    .slice(0, 3);

  const [p1, p2, p3] = payoutSplitAmounts(distributableCents, settings);
  const payoutByIndex = [p1, p2, p3];
  const winnerMap = new Map<string, number>();
  winners.forEach((winner, idx) => winnerMap.set(winner.id, payoutByIndex[idx] ?? 0));

  for (const row of allSessions) {
    await admin()
      .from("escape_room_sessions")
      .update({
        platform_fee_cents: platformFeeCents,
        projected_payout_cents: winnerMap.get(row.id) ?? 0,
      })
      .eq("id", row.id);
  }

  for (const winner of winners) {
    const amount = winnerMap.get(winner.id) ?? 0;
    const existing = await admin()
      .from("escape_room_payouts")
      .select("*")
      .eq("session_id", winner.id)
      .maybeSingle();
    if (!existing.data) {
      await admin().from("escape_room_payouts").insert({
        session_id: winner.id,
        player_id: winner.player_id,
        amount_cents: amount,
        status: "pending",
      });
    } else {
      const row = existing.data as PayoutRow;
      if (row.status === "pending") {
        await admin()
          .from("escape_room_payouts")
          .update({ amount_cents: amount })
          .eq("id", row.id);
      }
    }
  }
}

function trimPin(pin: string): string {
  return pin.replace(/\D/g, "").slice(0, 4);
}

export async function finishEscapeSession(input: EscapeFinishInput): Promise<{
  session: SessionRow;
  standing: EscapeWindowStanding | null;
  standings: EscapeWindowStanding[];
}> {
  const sessionRes = await admin()
    .from("escape_room_sessions")
    .select("*")
    .eq("id", input.sessionId)
    .eq("player_id", input.userId)
    .maybeSingle();
  if (sessionRes.error || !sessionRes.data) {
    throw new Error(sessionRes.error?.message ?? "Session not found");
  }
  const session = sessionRes.data as SessionRow;
  if (session.result !== "active") {
    throw new Error("Session already finished");
  }

  const settings = await getEscapeRoomSettings();
  const puzzleRes = await admin()
    .from("escape_room_puzzles")
    .select("*")
    .eq("id", session.puzzle_id)
    .maybeSingle();
  if (puzzleRes.error || !puzzleRes.data) {
    throw new Error(puzzleRes.error?.message ?? "Puzzle missing");
  }
  const puzzle = puzzleRes.data as PuzzleRow;

  const now = new Date();
  const startedAt = new Date(session.started_at);
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
  const timerExpired = elapsedSeconds > session.countdown_seconds;
  const timerValid = elapsedSeconds >= 0 && elapsedSeconds <= session.countdown_seconds + 5;

  const enteredPin = trimPin(input.enteredPin);
  const pinCorrect = enteredPin.length === 4 && enteredPin === puzzle.correct_pin;
  const solved = !!input.terminalFound && !!input.cabinetFound && !!input.keypadSolved && pinCorrect;

  let result: EscapeResult = "lose";
  if (!timerValid || timerExpired) result = "timeout";
  else if (solved) result = "win";

  const suspicious =
    result === "win" &&
    elapsedSeconds > 0 &&
    elapsedSeconds < Math.max(5, Number(settings.suspicious_min_escape_seconds) || 45);

  const updatePayload = {
    ended_at: now.toISOString(),
    server_elapsed_seconds: elapsedSeconds,
    escape_time_seconds: result === "win" ? elapsedSeconds : null,
    result,
    timer_valid: timerValid,
    entered_pin: enteredPin || null,
    suspicious,
    suspicious_reason: suspicious ? `escape_time_below_${settings.suspicious_min_escape_seconds}s` : null,
    puzzle_progress: {
      terminalFound: !!input.terminalFound,
      cabinetFound: !!input.cabinetFound,
      keypadSolved: !!input.keypadSolved,
      pinCorrect,
      inventory: input.inventory ?? [],
      clientMeta: input.clientMeta ?? {},
    },
    payout_status: result === "win" && session.mode === "stake" ? "pending" : "none",
  };

  const updated = await admin()
    .from("escape_room_sessions")
    .update(updatePayload)
    .eq("id", session.id)
    .select("*")
    .single();
  if (updated.error || !updated.data) {
    throw new Error(updated.error?.message ?? "Failed to finish session");
  }
  const finalSession = updated.data as SessionRow;

  await admin().from("escape_room_timer_logs").insert({
    session_id: session.id,
    event_type: "finish",
    payload: {
      elapsedSeconds,
      timerValid,
      timerExpired,
      result,
      terminalFound: !!input.terminalFound,
      cabinetFound: !!input.cabinetFound,
      keypadSolved: !!input.keypadSolved,
      pinCorrect,
    },
  });

  if (suspicious) {
    await admin().from("escape_room_flags").insert({
      session_id: session.id,
      player_id: session.player_id,
      reason: finalSession.suspicious_reason ?? "suspicious_time",
      flag_type: "suspicious_time",
      status: "pending",
    });
  }

  if (session.mode === "stake") {
    await updateWindowPayouts(session.prize_pool_window, settings);
  }

  const standings = await getWindowStandings(session.prize_pool_window);
  const standing = standings.find((s) => s.sessionId === session.id) ?? null;

  const refreshed = await admin()
    .from("escape_room_sessions")
    .select("*")
    .eq("id", session.id)
    .single();

  return {
    session: (refreshed.data ?? finalSession) as SessionRow,
    standing,
    standings,
  };
}

export async function getWindowStandings(prizePoolWindow: string): Promise<EscapeWindowStanding[]> {
  const { data, error } = await admin()
    .from("escape_room_sessions")
    .select("id, player_id, escape_time_seconds, projected_payout_cents, result, timer_valid")
    .eq("prize_pool_window", prizePoolWindow)
    .eq("mode", "stake")
    .eq("result", "win")
    .eq("timer_valid", true)
    .order("escape_time_seconds", { ascending: true })
    .order("ended_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    player_id: string;
    escape_time_seconds: number;
    projected_payout_cents: number;
  }>;
  return rows.slice(0, 10).map((row, idx) => ({
    sessionId: row.id,
    userId: row.player_id,
    rank: idx + 1,
    escapeTimeSeconds: Number(row.escape_time_seconds ?? 0),
    projectedPayoutCents: Number(row.projected_payout_cents ?? 0),
  }));
}

export async function getEscapeLeaderboard(limit = 10): Promise<
  Array<{
    rank: number;
    session_id: string;
    user_id: string;
    email: string;
    escape_time_seconds: number;
    prize_cents: number;
    mode: EscapeMode;
  }>
> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await admin()
    .from("escape_room_sessions")
    .select("id, player_id, mode, escape_time_seconds, projected_payout_cents")
    .eq("result", "win")
    .eq("timer_valid", true)
    .gte("started_at", startOfDay.toISOString())
    .order("escape_time_seconds", { ascending: true })
    .limit(limit * 2);
  if (error) throw new Error(error.message);
  const sessions = (data ?? []) as Array<{
    id: string;
    player_id: string;
    mode: EscapeMode;
    escape_time_seconds: number;
    projected_payout_cents: number;
  }>;
  const top = sessions.slice(0, limit);
  const userIds = Array.from(new Set(top.map((t) => t.player_id)));
  const users = await admin().from("users").select("id, email").in("id", userIds);
  const userMap = new Map<string, string>(
    ((users.data ?? []) as Array<{ id: string; email?: string | null }>).map((u) => [u.id, u.email ?? "—"])
  );
  return top.map((row, idx) => ({
    rank: idx + 1,
    session_id: row.id,
    user_id: row.player_id,
    email: userMap.get(row.player_id) ?? "—",
    escape_time_seconds: Number(row.escape_time_seconds ?? 0),
    prize_cents: Number(row.projected_payout_cents ?? 0),
    mode: row.mode,
  }));
}

export async function getLiveSessions(): Promise<
  Array<{
    id: string;
    player_id: string;
    email: string;
    mode: EscapeMode;
    stake_cents: number;
    elapsed_seconds: number;
    started_at: string;
  }>
> {
  const { data, error } = await admin()
    .from("escape_room_sessions")
    .select("id, player_id, mode, stake_cents, started_at")
    .eq("result", "active")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    player_id: string;
    mode: EscapeMode;
    stake_cents: number;
    started_at: string;
  }>;
  const userIds = Array.from(new Set(rows.map((r) => r.player_id)));
  const users = await admin().from("users").select("id, email").in("id", userIds);
  const userMap = new Map<string, string>(
    ((users.data ?? []) as Array<{ id: string; email?: string | null }>).map((u) => [u.id, u.email ?? "—"])
  );
  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    player_id: row.player_id,
    email: userMap.get(row.player_id) ?? "—",
    mode: row.mode,
    stake_cents: toCents(row.stake_cents),
    started_at: row.started_at,
    elapsed_seconds: Math.max(0, Math.floor((now - new Date(row.started_at).getTime()) / 1000)),
  }));
}

export async function getPrizePoolSnapshot(windowKey?: string): Promise<{
  prize_pool_window: string;
  total_staked_cents: number;
  platform_fee_cents: number;
  distributable_cents: number;
  stake_players: number;
}> {
  const activeWindow = windowKey ?? hourWindowKey(new Date());
  const { data, error } = await admin()
    .from("escape_room_sessions")
    .select("stake_cents")
    .eq("mode", "stake")
    .eq("prize_pool_window", activeWindow)
    .neq("result", "voided");
  if (error) throw new Error(error.message);
  const settings = await getEscapeRoomSettings();
  const total = ((data ?? []) as Array<{ stake_cents: number }>).reduce((sum, row) => sum + toCents(row.stake_cents), 0);
  const fee = Math.floor(total * ((Number(settings.platform_fee_percent) || 0) / 100));
  return {
    prize_pool_window: activeWindow,
    total_staked_cents: total,
    platform_fee_cents: fee,
    distributable_cents: Math.max(0, total - fee),
    stake_players: (data ?? []).length,
  };
}

export async function listSessions(filters?: {
  mode?: EscapeMode | "all";
  result?: EscapeResult | "all";
  from?: string;
  to?: string;
  minStakeCents?: number;
  maxStakeCents?: number;
  limit?: number;
  offset?: number;
}): Promise<SessionRow[]> {
  let query = admin().from("escape_room_sessions").select("*").order("started_at", { ascending: false });
  if (filters?.mode && filters.mode !== "all") query = query.eq("mode", filters.mode);
  if (filters?.result && filters.result !== "all") query = query.eq("result", filters.result);
  if (filters?.from) query = query.gte("started_at", filters.from);
  if (filters?.to) query = query.lte("started_at", filters.to);
  if (typeof filters?.minStakeCents === "number") query = query.gte("stake_cents", filters.minStakeCents);
  if (typeof filters?.maxStakeCents === "number") query = query.lte("stake_cents", filters.maxStakeCents);
  const limit = Math.min(500, Math.max(1, filters?.limit ?? 100));
  const offset = Math.max(0, filters?.offset ?? 0);
  query = query.range(offset, offset + limit - 1);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SessionRow[];
}

export async function listPlayers(limit = 500): Promise<
  Array<{
    user_id: string;
    email: string;
    games_played: number;
    total_staked_cents: number;
    total_won_cents: number;
    total_lost_cents: number;
    win_rate_percent: number;
    last_played_at: string | null;
    status: "active" | "suspended" | "banned";
    flagged_suspicious: boolean;
  }>
> {
  const sessions = await listSessions({ limit: 5000, offset: 0 });
  const byPlayer = new Map<
    string,
    {
      games: number;
      staked: number;
      won: number;
      lost: number;
      wins: number;
      last: string | null;
    }
  >();
  for (const row of sessions) {
    const current = byPlayer.get(row.player_id) ?? {
      games: 0,
      staked: 0,
      won: 0,
      lost: 0,
      wins: 0,
      last: null,
    };
    current.games += 1;
    current.staked += toCents(row.stake_cents);
    current.won += toCents(row.payout_cents || row.projected_payout_cents || 0);
    if (row.mode === "stake") current.lost += toCents(row.stake_cents);
    if (row.result === "win") current.wins += 1;
    if (!current.last || +new Date(row.started_at) > +new Date(current.last)) current.last = row.started_at;
    byPlayer.set(row.player_id, current);
  }
  const userIds = Array.from(byPlayer.keys());
  if (!userIds.length) return [];
  const usersRes = await admin().from("users").select("id, email").in("id", userIds);
  const statusRes = await admin()
    .from("escape_room_player_status")
    .select("player_id, status, flagged_suspicious")
    .in("player_id", userIds);
  const emailMap = new Map<string, string>(
    ((usersRes.data ?? []) as Array<{ id: string; email?: string | null }>).map((u) => [u.id, u.email ?? "—"])
  );
  const statusMap = new Map<string, { status: "active" | "suspended" | "banned"; flagged: boolean }>(
    ((statusRes.data ?? []) as Array<{
      player_id: string;
      status?: "active" | "suspended" | "banned";
      flagged_suspicious?: boolean;
    }>).map((row) => [row.player_id, { status: row.status ?? "active", flagged: !!row.flagged_suspicious }])
  );

  return Array.from(byPlayer.entries())
    .map(([userId, stats]) => {
      const s = statusMap.get(userId) ?? { status: "active" as const, flagged: false };
      return {
        user_id: userId,
        email: emailMap.get(userId) ?? "—",
        games_played: stats.games,
        total_staked_cents: stats.staked,
        total_won_cents: stats.won,
        total_lost_cents: Math.max(0, stats.staked - stats.won),
        win_rate_percent: stats.games ? (stats.wins / stats.games) * 100 : 0,
        last_played_at: stats.last,
        status: s.status,
        flagged_suspicious: s.flagged,
      };
    })
    .sort((a, b) => (b.last_played_at ?? "").localeCompare(a.last_played_at ?? ""))
    .slice(0, limit);
}

export async function setPlayerGameStatus(
  playerId: string,
  status: "active" | "suspended" | "banned",
  reason: string | null,
  adminId: string
) {
  const existing = await admin()
    .from("escape_room_player_status")
    .select("player_id")
    .eq("player_id", playerId)
    .maybeSingle();
  if (existing.data) {
    const { error } = await admin()
      .from("escape_room_player_status")
      .update({ status, reason, updated_by: adminId })
      .eq("player_id", playerId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await admin().from("escape_room_player_status").insert({
    player_id: playerId,
    status,
    reason,
    updated_by: adminId,
  });
  if (error) throw new Error(error.message);
}

export async function listFlags(status?: "pending" | "legit" | "cheated" | "voided") {
  let query = admin().from("escape_room_flags").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    session_id: string;
    player_id: string;
    reason: string;
    flag_type: string;
    status: "pending" | "legit" | "cheated" | "voided";
    notes: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;
}

export async function reviewFlag(
  flagId: string,
  verdict: "legit" | "cheated" | "voided",
  notes: string | null,
  adminId: string
) {
  const { data, error } = await admin()
    .from("escape_room_flags")
    .update({
      status: verdict,
      notes,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", flagId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function voidSession(sessionId: string, adminId: string, reason: string) {
  const { data: session, error } = await admin()
    .from("escape_room_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !session) throw new Error(error?.message ?? "Session not found");
  const s = session as SessionRow;
  if (s.result === "voided") return s;

  const refundAmount = s.mode === "stake" ? toCents(s.stake_cents) : 0;
  if (refundAmount > 0) {
    const refundReference = `escape_void_refund_${s.id}`;
    await walletLedgerEntry(s.player_id, "admin_adjustment", refundAmount, refundReference);
  }

  const update = await admin()
    .from("escape_room_sessions")
    .update({
      result: "voided",
      payout_status: "voided",
      payout_cents: 0,
      projected_payout_cents: 0,
      suspicious_reason: reason || "voided_by_admin",
      ended_at: s.ended_at ?? new Date().toISOString(),
    })
    .eq("id", s.id)
    .select("*")
    .single();
  if (update.error || !update.data) throw new Error(update.error?.message ?? "Failed to void");

  await admin().from("escape_room_timer_logs").insert({
    session_id: s.id,
    event_type: "void",
    payload: { reason, adminId },
  });

  await admin()
    .from("escape_room_payouts")
    .update({
      status: "voided",
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("session_id", s.id);

  const settings = await getEscapeRoomSettings();
  if (s.mode === "stake") {
    await updateWindowPayouts(s.prize_pool_window, settings);
  }
  return update.data as SessionRow;
}

export async function reviewPayout(
  sessionId: string,
  action: "approve" | "reject",
  adminId: string,
  reason?: string
) {
  const payoutRes = await admin()
    .from("escape_room_payouts")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (payoutRes.error || !payoutRes.data) {
    throw new Error(payoutRes.error?.message ?? "Payout not found");
  }
  const payout = payoutRes.data as PayoutRow;
  if (action === "reject") {
    const rejected = await admin()
      .from("escape_room_payouts")
      .update({
        status: "rejected",
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        error_message: reason ?? null,
      })
      .eq("id", payout.id)
      .select("*")
      .single();
    await admin()
      .from("escape_room_sessions")
      .update({
        payout_status: "rejected",
        payout_cents: 0,
      })
      .eq("id", sessionId);
    if (rejected.error) throw new Error(rejected.error.message);
    return rejected.data as PayoutRow;
  }

  const payoutAmount = toCents(payout.amount_cents);
  const ledgerReference = `escape_payout_${sessionId}`;
  const credit = await walletLedgerEntry(payout.player_id, "game_win", payoutAmount, ledgerReference);
  if (!credit.success) {
    const failed = await admin()
      .from("escape_room_payouts")
      .update({
        status: "failed",
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        error_message: credit.message,
      })
      .eq("id", payout.id)
      .select("*")
      .single();
    await admin()
      .from("escape_room_sessions")
      .update({ payout_status: "failed" })
      .eq("id", sessionId);
    if (failed.error) throw new Error(failed.error.message);
    return failed.data as PayoutRow;
  }

  const nowIso = new Date().toISOString();
  const approved = await admin()
    .from("escape_room_payouts")
    .update({
      status: "paid",
      reviewed_by: adminId,
      reviewed_at: nowIso,
      paid_at: nowIso,
      error_message: null,
    })
    .eq("id", payout.id)
    .select("*")
    .single();
  await admin()
    .from("escape_room_sessions")
    .update({
      payout_status: "paid",
      payout_cents: payoutAmount,
      payout_reference: ledgerReference,
    })
    .eq("id", sessionId);
  await admin().from("escape_room_timer_logs").insert({
    session_id: sessionId,
    event_type: "payout",
    payload: { action: "paid", amountCents: payoutAmount, adminId },
  });
  if (approved.error) throw new Error(approved.error.message);
  return approved.data as PayoutRow;
}

export async function getSessionReplayMetadata(sessionId: string): Promise<{
  session: SessionRow | null;
  timerLogs: Array<{ id: number; event_type: string; server_time: string; payload: Record<string, unknown> }>;
}> {
  const [sessionRes, logsRes] = await Promise.all([
    admin().from("escape_room_sessions").select("*").eq("id", sessionId).maybeSingle(),
    admin()
      .from("escape_room_timer_logs")
      .select("id, event_type, server_time, payload")
      .eq("session_id", sessionId)
      .order("server_time", { ascending: true }),
  ]);
  if (logsRes.error) throw new Error(logsRes.error.message);
  return {
    session: (sessionRes.data as SessionRow | null) ?? null,
    timerLogs: (logsRes.data ?? []) as Array<{
      id: number;
      event_type: string;
      server_time: string;
      payload: Record<string, unknown>;
    }>,
  };
}

export async function getAdminStats(range: "daily" | "weekly" | "monthly" = "daily") {
  const now = new Date();
  const rangeStart = new Date(now);
  if (range === "weekly") rangeStart.setDate(now.getDate() - 7);
  else if (range === "monthly") rangeStart.setMonth(now.getMonth() - 1);
  else rangeStart.setHours(0, 0, 0, 0);

  const [sessions, liveSessions, players, payouts] = await Promise.all([
    listSessions({ from: rangeStart.toISOString(), limit: 5000, offset: 0 }),
    getLiveSessions(),
    listPlayers(5000),
    admin()
      .from("escape_room_payouts")
      .select("amount_cents, status, created_at")
      .gte("created_at", rangeStart.toISOString()),
  ]);

  const totalPrizePoolCents = sessions.reduce((sum, s) => sum + toCents(s.stake_cents), 0);
  const totalRevenueCents = sessions.reduce((sum, s) => sum + toCents(s.platform_fee_cents), 0);
  const totalPayoutsCents = sessions.reduce((sum, s) => sum + toCents(s.payout_cents), 0);
  const wins = sessions.filter((s) => s.result === "win").length;
  const avgEscapeTime =
    sessions.filter((s) => s.result === "win" && (s.escape_time_seconds ?? 0) > 0).reduce((sum, s, _, arr) => {
      return sum + (s.escape_time_seconds ?? 0) / Math.max(1, arr.length);
    }, 0) || 0;

  const byDay = new Map<string, { stake: number; fee: number; payout: number; games: number }>();
  for (const s of sessions) {
    const day = s.started_at.slice(0, 10);
    const current = byDay.get(day) ?? { stake: 0, fee: 0, payout: 0, games: 0 };
    current.stake += toCents(s.stake_cents);
    current.fee += toCents(s.platform_fee_cents);
    current.payout += toCents(s.payout_cents);
    current.games += 1;
    byDay.set(day, current);
  }

  return {
    playersOnline: liveSessions.length,
    activeSessions: liveSessions,
    totalPrizePoolCents,
    totalRevenueCents,
    totalPayoutsCents,
    totalGamesPlayed: sessions.length,
    totalMembersPlayed: players.length,
    avgEscapeTimeSeconds: Math.round(avgEscapeTime),
    escapeSuccessRatePercent: sessions.length ? (wins / sessions.length) * 100 : 0,
    revenueSeries: Array.from(byDay.entries())
      .map(([day, value]) => ({ day, ...value }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    pendingPayoutCount: ((payouts.data ?? []) as Array<{ status?: string }>).filter(
      (p) => p.status === "pending"
    ).length,
  };
}

export async function getFinancialSummary(filters?: { from?: string; to?: string }) {
  const sessions = await listSessions({
    from: filters?.from,
    to: filters?.to,
    limit: 5000,
    offset: 0,
  });
  const payoutsRes = await admin()
    .from("escape_room_payouts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (payoutsRes.error) throw new Error(payoutsRes.error.message);
  const payouts = (payoutsRes.data ?? []) as PayoutRow[];

  const totalRevenueCents = sessions.reduce((sum, s) => sum + toCents(s.platform_fee_cents), 0);
  const totalStakedCents = sessions.reduce((sum, s) => sum + toCents(s.stake_cents), 0);
  const totalPaidCents = payouts
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + toCents(p.amount_cents), 0);
  const pendingPayouts = payouts.filter((p) => p.status === "pending");
  const payoutHistory = payouts.filter((p) => p.status !== "pending");
  const failures = payouts.filter((p) => p.status === "failed");

  const dailyMap = new Map<string, { revenue: number; staked: number; paid: number }>();
  sessions.forEach((s) => {
    const key = s.started_at.slice(0, 10);
    const cur = dailyMap.get(key) ?? { revenue: 0, staked: 0, paid: 0 };
    cur.revenue += toCents(s.platform_fee_cents);
    cur.staked += toCents(s.stake_cents);
    cur.paid += toCents(s.payout_cents);
    dailyMap.set(key, cur);
  });

  return {
    totalRevenueCents,
    totalStakedCents,
    totalPaidCents,
    pendingPayouts,
    payoutHistory,
    payoutFailures: failures,
    dailyRevenue: Array.from(dailyMap.entries())
      .map(([day, values]) => ({ day, ...values }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}

