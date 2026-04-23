/**
 * C-Lo staging / admin accounting audit — read-only aggregation from existing tables.
 * Does not mutate data. Intended for service-role Supabase clients behind admin auth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Ledger reference patterns (must stay aligned with API routes). */
export const CeloLedgerRefPatterns = {
  bankerWin: (roundId: string) => `celo_round_banker_win_${roundId}`,
  playersWinPrefix: (roundId: string) => `celo_round_players_win_${roundId}_`,
  playerInstantWinPrefix: (roundId: string) => `celo_player_win_${roundId}_`,
  playerPointPrefix: (roundId: string) => `celo_player_point_${roundId}_`,
  joinDebitPrefix: (roomId: string) => `celo_join_${roomId}_`,
  joinRefundPrefix: (roomId: string) => `celo_join_refund_${roomId}_`,
  platformFeeBanker: (roundId: string) => `celo_pf_${roundId}_banker_table`,
  platformFeeInstantLoss: (roundId: string, userId: string) =>
    `celo_pf_${roundId}_instant_loss_${userId}`,
  platformFeePlayerWin: (roundId: string, userId: string) =>
    `celo_pf_${roundId}_player_win_${userId}`,
  platformFeePointWin: (roundId: string, userId: string) =>
    `celo_pf_${roundId}_point_win_${userId}`,
} as const;

export type CeloCoinLedgerRow = {
  id: string;
  user_id: string;
  type: string;
  gold_coins: number;
  gpay_coins: number;
  description: string | null;
  reference: string;
  created_at: string;
};

export type CeloRoundAccountingTrace = {
  room_id: string;
  round_id: string;
  round_number: number;
  status: string;
  completed_at: string | null;
  banker_id: string | null;
  prize_pool_sc: number | null;
  platform_fee_sc: number | null;
  banker_dice: unknown;
  banker_dice_result: string | null;
  banker_point: number | null;
  current_player_seat: number | null;
  player_rolls: Array<{
    user_id: string;
    outcome: string | null;
    payout_sc: number | null;
    dice: unknown;
    roll_result: string | null;
    created_at: string;
  }>;
  /** Historical stake per player is cleared after round; rolls + prize_pool are the audit trail. */
  snapshot_note: string;
  ledger_by_category: {
    entry_debits_room: CeloCoinLedgerRow[];
    entry_refunds_room: CeloCoinLedgerRow[];
    round_credits: CeloCoinLedgerRow[];
    round_debits: CeloCoinLedgerRow[];
    sidebet_and_misc: CeloCoinLedgerRow[];
  };
  payout_references_observed: string[];
  platform_fee_rows: Array<{
    id?: string;
    amount_cents: number;
    description: string | null;
    user_id: string | null;
    source_id: string | null;
    idempotency_key: string | null;
    created_at: string | null;
  }>;
  side_bets_for_round: Array<{
    id: string;
    status: string;
    creator_id: string;
    acceptor_id: string | null;
    amount_cents: number;
    bet_type: string;
    round_id: string | null;
  }>;
  inferred_settlement: {
    shape:
      | "banker_instant_win"
      | "banker_instant_loss"
      | "player_resolved"
      | "in_progress"
      | "unknown";
    expected_credit_refs: string[];
    notes: string[];
  };
  bank_context: {
    /** Room bank is not versioned; interpret with last known settlement only. */
    current_bank_sc_observed: number | null;
    expected_banker_credit_gpc_if_instant_win: number | null;
    observed_banker_credit_gpc: number | null;
    bank_credit_matches_instant_win: boolean | null;
  };
};

export type CeloRoundConsistencyReport = {
  round_id: string;
  ok: boolean;
  issues: string[];
  warnings: string[];
  checks: {
    not_active_and_completed: boolean;
    duplicate_payout_reference_rows: string[];
    duplicate_player_win_per_user: string[];
    payout_refs_unique: boolean;
    entry_ref_patterns_ok: boolean;
    sidebet_refs_unique_for_bet: boolean;
  };
};

export type CeloRoomBankReport = {
  room_id: string;
  current_bank_sc: number | null;
  last_completed_round: {
    round_id: string;
    round_number: number;
    banker_dice_result: string | null;
    prize_pool_sc: number | null;
    platform_fee_sc: number | null;
  } | null;
  flags: string[];
};

function classifyLedgerRow(
  row: CeloCoinLedgerRow,
  roomId: string,
  roundId: string
): "entry_debits_room" | "entry_refunds_room" | "round" | "sidebet_misc" {
  const ref = row.reference ?? "";
  if (ref.startsWith(CeloLedgerRefPatterns.joinDebitPrefix(roomId))) {
    return "entry_debits_room";
  }
  if (ref.startsWith(CeloLedgerRefPatterns.joinRefundPrefix(roomId))) {
    return "entry_refunds_room";
  }
  if (ref.includes(roundId)) {
    return "round";
  }
  if (/celo_side/i.test(ref)) {
    return "sidebet_misc";
  }
  return "sidebet_misc";
}

async function fetchCoinTxForRound(
  admin: SupabaseClient,
  roundId: string,
  roomId: string
): Promise<CeloCoinLedgerRow[]> {
  const { data: byRound } = await admin
    .from("coin_transactions")
    .select("id, user_id, type, gold_coins, gpay_coins, description, reference, created_at")
    .ilike("reference", `%${roundId}%`)
    .order("created_at", { ascending: true });

  const { data: joins } = await admin
    .from("coin_transactions")
    .select("id, user_id, type, gold_coins, gpay_coins, description, reference, created_at")
    .ilike("reference", `${CeloLedgerRefPatterns.joinDebitPrefix(roomId)}%`)
    .order("created_at", { ascending: true });

  const { data: refunds } = await admin
    .from("coin_transactions")
    .select("id, user_id, type, gold_coins, gpay_coins, description, reference, created_at")
    .ilike("reference", `${CeloLedgerRefPatterns.joinRefundPrefix(roomId)}%`)
    .order("created_at", { ascending: true });

  const map = new Map<string, CeloCoinLedgerRow>();
  for (const r of [...(byRound ?? []), ...(joins ?? []), ...(refunds ?? [])] as CeloCoinLedgerRow[]) {
    map.set(r.id, r);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

async function fetchPlatformFees(admin: SupabaseClient, roundId: string) {
  const { data } = await admin
    .from("platform_earnings")
    .select("id, amount_cents, description, user_id, source_id, idempotency_key, created_at")
    .eq("source", "celo_game")
    .or(`source_id.eq.${roundId},idempotency_key.ilike.%${roundId}%`)
    .order("created_at", { ascending: true });
  return (data ?? []) as CeloRoundAccountingTrace["platform_fee_rows"];
}

/** Build a single-round accounting trace (read-only). */
export async function buildCeloRoundAccountingTrace(
  admin: SupabaseClient,
  roomId: string,
  roundRow: Record<string, unknown>
): Promise<CeloRoundAccountingTrace> {
  const roundId = String(roundRow.id ?? "");
  const status = String(roundRow.status ?? "");
  const bankerDiceResult = (roundRow.banker_dice_result as string | null) ?? null;

  const { data: roomRaw } = await admin
    .from("celo_rooms")
    .select("current_bank_sc, current_bank_cents")
    .eq("id", roomId)
    .maybeSingle();
  const room = roomRaw as { current_bank_sc?: number; current_bank_cents?: number } | null;
  const currentBank =
    room != null
      ? Math.max(0, Math.floor(Number(room.current_bank_sc ?? room.current_bank_cents ?? 0)))
      : null;

  const { data: rolls } = await admin
    .from("celo_player_rolls")
    .select("user_id, outcome, payout_sc, dice, roll_result, created_at")
    .eq("round_id", roundId)
    .order("created_at", { ascending: true });

  const { data: sideBets } = await admin
    .from("celo_side_bets")
    .select("id, status, creator_id, acceptor_id, amount_cents, bet_type, round_id")
    .eq("room_id", roomId)
    .eq("round_id", roundId);

  const allTx = await fetchCoinTxForRound(admin, roundId, roomId);
  const ledger_by_category: CeloRoundAccountingTrace["ledger_by_category"] = {
    entry_debits_room: [],
    entry_refunds_room: [],
    round_credits: [],
    round_debits: [],
    sidebet_and_misc: [],
  };

  for (const row of allTx) {
    const cat = classifyLedgerRow(row, roomId, roundId);
    if (cat === "entry_debits_room") ledger_by_category.entry_debits_room.push(row);
    else if (cat === "entry_refunds_room") ledger_by_category.entry_refunds_room.push(row);
    else if (cat === "round") {
      if (Number(row.gpay_coins) < 0) ledger_by_category.round_debits.push(row);
      else ledger_by_category.round_credits.push(row);
    } else ledger_by_category.sidebet_and_misc.push(row);
  }

  const payout_references_observed = ledger_by_category.round_credits
    .map((r) => r.reference)
    .filter(
      (ref) =>
        ref.startsWith(`celo_round_banker_win_${roundId}`) ||
        ref.startsWith(`celo_round_players_win_${roundId}_`) ||
        ref.startsWith(`celo_player_win_${roundId}_`) ||
        ref.startsWith(`celo_player_point_${roundId}_`)
    );

  const prizePool = roundRow.prize_pool_sc != null ? Math.floor(Number(roundRow.prize_pool_sc)) : null;
  const feeSc =
    roundRow.platform_fee_sc != null ? Math.floor(Number(roundRow.platform_fee_sc)) : null;
  const expectedBankerCredit =
    bankerDiceResult === "instant_win" && prizePool != null && feeSc != null
      ? Math.max(0, prizePool - feeSc)
      : null;

  const bankerWinRef = CeloLedgerRefPatterns.bankerWin(roundId);
  const bankerCreditRow = ledger_by_category.round_credits.find(
    (r) => r.reference === bankerWinRef
  );
  const observedBankerCredit = bankerCreditRow
    ? Math.max(0, Math.floor(Number(bankerCreditRow.gpay_coins)))
    : null;

  const bankCreditMatches =
    expectedBankerCredit != null && observedBankerCredit != null
      ? expectedBankerCredit === observedBankerCredit
      : null;

  const expectedCreditRefs: string[] = [];
  const notes: string[] = [];
  let shape: CeloRoundAccountingTrace["inferred_settlement"]["shape"] = "unknown";

  if (status === "banker_rolling" || status === "player_rolling" || status === "betting") {
    shape = "in_progress";
    notes.push("Round not completed; ledger may be incomplete.");
  } else if (status === "completed") {
    if (bankerDiceResult === "instant_win") {
      shape = "banker_instant_win";
      expectedCreditRefs.push(bankerWinRef);
      expectedCreditRefs.push(CeloLedgerRefPatterns.platformFeeBanker(roundId));
    } else if (bankerDiceResult === "instant_loss") {
      shape = "banker_instant_loss";
      notes.push("Expect one celo_round_players_win_<round>_<user> credit per staked player (see rolls absent for full reconciliation).");
    } else if (bankerDiceResult === "point" || (rolls?.length ?? 0) > 0) {
      shape = "player_resolved";
      notes.push("Payout refs may include celo_player_win_ and celo_player_point_ per outcome.");
    }
  }

  if (bankerDiceResult === "no_count") {
    notes.push("no_count may repeat; settlement refs apply to resolving banker outcome only.");
  }

  const platform_fee_rows = await fetchPlatformFees(admin, roundId);

  return {
    room_id: roomId,
    round_id: roundId,
    round_number: Math.floor(Number(roundRow.round_number ?? 0)),
    status,
    completed_at: (roundRow.completed_at as string | null) ?? null,
    banker_id: (roundRow.banker_id as string | null) ?? null,
    prize_pool_sc: prizePool,
    platform_fee_sc: feeSc,
    banker_dice: roundRow.banker_dice,
    banker_dice_result: bankerDiceResult,
    banker_point: roundRow.banker_point != null ? Math.floor(Number(roundRow.banker_point)) : null,
    current_player_seat:
      roundRow.current_player_seat != null
        ? Math.floor(Number(roundRow.current_player_seat))
        : null,
    player_rolls: (rolls ?? []) as CeloRoundAccountingTrace["player_rolls"],
    snapshot_note:
      "celo_room_players.entry_sc is cleared after settlement; use prize_pool_sc, player_rolls, and ledger refs to reconstruct stakes.",
    ledger_by_category,
    payout_references_observed,
    platform_fee_rows,
    side_bets_for_round: (sideBets ?? []) as CeloRoundAccountingTrace["side_bets_for_round"],
    inferred_settlement: { shape, expected_credit_refs: expectedCreditRefs, notes },
    bank_context: {
      current_bank_sc_observed: currentBank,
      expected_banker_credit_gpc_if_instant_win: expectedBankerCredit,
      observed_banker_credit_gpc: observedBankerCredit,
      bank_credit_matches_instant_win: bankCreditMatches,
    },
  };
}

/** Consistency checks for one round (reports only; no writes). */
export function runCeloRoundConsistencyChecks(
  trace: CeloRoundAccountingTrace
): CeloRoundConsistencyReport {
  const issues: string[] = [];
  const warnings: string[] = [];
  const roundId = trace.round_id;

  const activeStatuses = new Set(["banker_rolling", "player_rolling", "betting"]);
  const notActiveAndCompleted =
    activeStatuses.has(trace.status) && trace.completed_at != null;
  if (notActiveAndCompleted) {
    issues.push("Round status is still active-like but completed_at is set.");
  }

  const creditRefs = trace.ledger_by_category.round_credits.map((r) => r.reference);
  const refCounts = new Map<string, number>();
  for (const ref of creditRefs) {
    refCounts.set(ref, (refCounts.get(ref) ?? 0) + 1);
  }
  const duplicate_payout_reference_rows = Array.from(refCounts.entries())
    .filter(([, n]) => n > 1)
    .map(([ref]) => ref);

  const userWinCounts = new Map<string, number>();
  for (const r of trace.ledger_by_category.round_credits) {
    const ref = r.reference;
    let userKey: string | null = null;
    const pw = `celo_player_win_${roundId}_`;
    const pp = `celo_player_point_${roundId}_`;
    const pl = `celo_round_players_win_${roundId}_`;
    if (ref.startsWith(pw)) userKey = ref.slice(pw.length);
    else if (ref.startsWith(pp)) userKey = ref.slice(pp.length);
    else if (ref.startsWith(pl)) userKey = ref.slice(pl.length);
    if (userKey) {
      const k = `${roundId}:${userKey}`;
      userWinCounts.set(k, (userWinCounts.get(k) ?? 0) + 1);
    }
  }
  const duplicate_player_win_per_user = Array.from(userWinCounts.entries())
    .filter(([, n]) => n > 1)
    .map(([k]) => k);

  const payout_refs_unique = duplicate_payout_reference_rows.length === 0;

  const joinRefs = trace.ledger_by_category.entry_debits_room.map((r) => r.reference);
  const joinRefOk = joinRefs.every((ref) => ref.startsWith(`celo_join_${trace.room_id}_`));
  if (joinRefs.length > 0 && !joinRefOk) {
    warnings.push("Some entry_debits_room refs do not match celo_join_<roomId>_ pattern.");
  }

  const sideAcceptRefs = trace.ledger_by_category.sidebet_and_misc.filter((r) =>
    r.reference.startsWith("celo_side_accept_")
  );
  const sideCreateRefs = trace.ledger_by_category.sidebet_and_misc.filter((r) =>
    r.reference.startsWith("celo_side_create_")
  );
  const sidebetKeyGroups = new Map<string, number>();
  for (const r of [...sideAcceptRefs, ...sideCreateRefs]) {
    sidebetKeyGroups.set(r.reference, (sidebetKeyGroups.get(r.reference) ?? 0) + 1);
  }
  const sidebet_dupes = Array.from(sidebetKeyGroups.entries()).filter(([, n]) => n > 1);
  const sidebet_refs_unique_for_bet = sidebet_dupes.length === 0;

  if (trace.status === "completed" && trace.banker_dice_result === "instant_win") {
    if (trace.bank_context.observed_banker_credit_gpc == null) {
      warnings.push("Completed banker instant_win but no celo_round_banker_win ledger credit found.");
    } else if (trace.bank_context.bank_credit_matches_instant_win === false) {
      issues.push(
        `Banker credit GPC (${trace.bank_context.observed_banker_credit_gpc}) != expected (${trace.bank_context.expected_banker_credit_gpc_if_instant_win}).`
      );
    }
  }

  if (duplicate_payout_reference_rows.length > 0) {
    issues.push(`Duplicate credit references: ${duplicate_payout_reference_rows.join(", ")}`);
  }
  if (duplicate_player_win_per_user.length > 0) {
    issues.push(`Multiple win credits for same round/user: ${duplicate_player_win_per_user.join(", ")}`);
  }

  const ok = issues.length === 0;

  return {
    round_id: roundId,
    ok,
    issues,
    warnings,
    checks: {
      not_active_and_completed: !notActiveAndCompleted,
      duplicate_payout_reference_rows,
      duplicate_player_win_per_user,
      payout_refs_unique,
      entry_ref_patterns_ok: joinRefOk || joinRefs.length === 0,
      sidebet_refs_unique_for_bet,
    },
  };
}

/** Room-level bank hints vs last completed round (heuristic; no mutation). */
export async function buildCeloRoomBankReport(
  admin: SupabaseClient,
  roomId: string
): Promise<CeloRoomBankReport> {
  const flags: string[] = [];
  const { data: room } = await admin
    .from("celo_rooms")
    .select("current_bank_sc, current_bank_cents")
    .eq("id", roomId)
    .maybeSingle();
  const r = room as { current_bank_sc?: number; current_bank_cents?: number } | null;
  const current_bank_sc =
    r != null ? Math.max(0, Math.floor(Number(r.current_bank_sc ?? r.current_bank_cents ?? 0))) : null;

  const { data: lastCompleted } = await admin
    .from("celo_rounds")
    .select("id, round_number, banker_dice_result, prize_pool_sc, platform_fee_sc, status")
    .eq("room_id", roomId)
    .eq("status", "completed")
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lc = lastCompleted as {
    id: string;
    round_number: number;
    banker_dice_result: string | null;
    prize_pool_sc: number | null;
    platform_fee_sc: number | null;
  } | null;

  if (lc?.banker_dice_result === "instant_win") {
    const rid = lc.id;
    const { data: tx } = await admin
      .from("coin_transactions")
      .select("gpay_coins, reference")
      .eq("reference", CeloLedgerRefPatterns.bankerWin(rid))
      .maybeSingle();
    const prize = Math.max(0, Math.floor(Number(lc.prize_pool_sc ?? 0)));
    const fee = Math.max(0, Math.floor(Number(lc.platform_fee_sc ?? 0)));
    const expected = Math.max(0, prize - fee);
    const observed = tx
      ? Math.max(0, Math.floor(Number((tx as { gpay_coins: number }).gpay_coins)))
      : null;
    if (observed == null) {
      flags.push(
        "Last completed round was banker instant_win but no celo_round_banker_win coin_transactions row."
      );
    } else if (observed !== expected) {
      flags.push(
        `Last banker instant_win: ledger credit ${observed} GPC vs expected ${expected} GPC (prize ${prize} − fee ${fee}).`
      );
    }
  }

  return {
    room_id: roomId,
    current_bank_sc,
    last_completed_round: lc
      ? {
          round_id: lc.id,
          round_number: lc.round_number,
          banker_dice_result: lc.banker_dice_result,
          prize_pool_sc: lc.prize_pool_sc,
          platform_fee_sc: lc.platform_fee_sc,
        }
      : null,
    flags,
  };
}

export async function auditCeloRoomRounds(
  admin: SupabaseClient,
  roomId: string,
  options?: { roundId?: string; limit?: number }
): Promise<{
  room_id: string;
  traces: Array<{ trace: CeloRoundAccountingTrace; consistency: CeloRoundConsistencyReport }>;
  room_bank: CeloRoomBankReport;
}> {
  const limit = Math.min(50, Math.max(1, options?.limit ?? 8));
  let rows: Record<string, unknown>[] = [];

  if (options?.roundId) {
    const { data, error } = await admin
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .eq("id", options.roundId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    rows = data ? [data as Record<string, unknown>] : [];
  } else {
    const { data, error } = await admin
      .from("celo_rounds")
      .select("*")
      .eq("room_id", roomId)
      .order("round_number", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as Record<string, unknown>[];
  }
  const traces: Array<{ trace: CeloRoundAccountingTrace; consistency: CeloRoundConsistencyReport }> = [];

  for (const row of rows) {
    const trace = await buildCeloRoundAccountingTrace(admin, roomId, row);
    const consistency = runCeloRoundConsistencyChecks(trace);
    traces.push({ trace, consistency });
  }

  const room_bank = await buildCeloRoomBankReport(admin, roomId);

  return { room_id: roomId, traces, room_bank };
}
