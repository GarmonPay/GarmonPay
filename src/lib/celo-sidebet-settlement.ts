/**
 * Server-authoritative C-Lo side-bet settlement when a round completes.
 * Idempotent credits + conditional row updates (matched → terminal).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { creditGpayIdempotent } from "@/lib/coins";
import { celoAccountingAuditLog, celoAccountingLog } from "@/lib/celo-accounting";
import { insertCeloPlatformFee } from "@/lib/celo-platform-fee";

export const CELO_SIDEBET_PAYOUT_REF = (betId: string) =>
  `celo_side_settle_payout_${betId}`;
export const CELO_SIDEBET_VOID_REF = (betId: string, party: "creator" | "acceptor") =>
  `celo_side_settle_void_${betId}_${party}`;

type PlayerRollLite = { outcome: string | null };

/** Whether the banker wins the round (main table outcome), for banker_wins / player_wins props. */
export function didBankerWinCeloRound(
  bankerDiceResult: string | null,
  playerRolls: PlayerRollLite[]
): boolean | null {
  if (!bankerDiceResult) return null;
  if (bankerDiceResult === "instant_win") return true;
  if (bankerDiceResult === "instant_loss") return false;
  if (bankerDiceResult === "point") {
    const anyPlayerWin = playerRolls.some((r) => r.outcome === "win");
    return !anyPlayerWin;
  }
  if (bankerDiceResult === "no_count") return null;
  return null;
}

function normName(name: string | null | undefined): string {
  return String(name ?? "").toUpperCase();
}

/**
 * Creator posted the proposition; acceptor took the other side.
 * Returns whether the creator wins the pot, or null = void (refund both).
 */
export function resolveSideBetCreatorWins(args: {
  betType: string;
  bankerDiceResult: string | null;
  bankerDiceName: string | null;
  playerRolls: PlayerRollLite[];
}): boolean | null {
  const { betType, bankerDiceResult, bankerDiceName, playerRolls } = args;
  const name = normName(bankerDiceName);
  const bankerOutcome = didBankerWinCeloRound(bankerDiceResult, playerRolls);

  switch (betType) {
    case "banker_wins": {
      if (bankerOutcome === null) return null;
      return bankerOutcome;
    }
    case "player_wins": {
      if (bankerOutcome === null) return null;
      return !bankerOutcome;
    }
    case "celo": {
      if (bankerDiceResult !== "instant_win") return false;
      return name.includes("C-LO");
    }
    case "shit": {
      if (bankerDiceResult !== "instant_loss") return false;
      return name.includes("SHIT");
    }
    case "trips": {
      if (bankerDiceResult !== "instant_win") return false;
      return name.includes("TRIP") || name.includes("ACE OUT");
    }
    case "hand_crack": {
      if (bankerDiceResult !== "instant_win") return false;
      return name.includes("HAND CRACK");
    }
    default:
      return null;
  }
}

type SideBetRow = {
  id: string;
  room_id: string;
  round_id: string | null;
  creator_id: string;
  acceptor_id: string | null;
  bet_type: string;
  amount_cents: number;
  odds_multiplier: number;
  status: string;
};

/** Re-read round from DB and settle matched side bets (safe after any completion path). */
export async function runCeloSideBetSettlementAfterRoundComplete(
  admin: SupabaseClient,
  roomId: string,
  roundId: string,
  platformFeePct: number
): Promise<void> {
  const { data: row } = await admin
    .from("celo_rounds")
    .select("*")
    .eq("id", roundId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (!row) return;
  await settleCeloSideBetsForCompletedRound(admin, {
    roomId,
    roundId,
    roundRow: row as Record<string, unknown>,
    platformFeePct,
  });
}

export async function settleCeloSideBetsForCompletedRound(
  admin: SupabaseClient,
  ctx: {
    roomId: string;
    roundId: string;
    /** completed round row (must include banker_dice_* and status) */
    roundRow: Record<string, unknown>;
    platformFeePct: number;
  }
): Promise<void> {
  const { roomId, roundId, roundRow, platformFeePct } = ctx;
  const status = String(roundRow.status ?? "");
  if (status !== "completed") return;

  const bankerDiceResult = (roundRow.banker_dice_result as string | null) ?? null;
  const bankerDiceName = (roundRow.banker_dice_name as string | null) ?? null;

  const { data: rolls } = await admin
    .from("celo_player_rolls")
    .select("outcome")
    .eq("round_id", roundId);

  const playerRolls = (rolls ?? []) as PlayerRollLite[];

  const { data: bets } = await admin
    .from("celo_side_bets")
    .select(
      "id, room_id, round_id, creator_id, acceptor_id, bet_type, amount_cents, odds_multiplier, status"
    )
    .eq("room_id", roomId)
    .eq("round_id", roundId)
    .eq("status", "matched");

  const list = (bets ?? []) as SideBetRow[];
  if (list.length === 0) return;

  celoAccountingAuditLog("sidebet_settlement_round_start", {
    roomId,
    roundId,
    matchedCount: list.length,
  });
  celoAccountingLog("sidebet_settlement_round_start", {
    roomId,
    roundId,
    matchedCount: list.length,
  });

  for (const bet of list) {
    if (!bet.acceptor_id) {
      celoAccountingAuditLog("sidebet_settlement_anomaly", {
        betId: bet.id,
        roundId,
        message: "matched row missing acceptor_id",
      });
      continue;
    }

    await settleOneMatchedSideBet(admin, {
      bet,
      bankerDiceResult,
      bankerDiceName,
      playerRolls,
      platformFeePct,
      roundId,
    });
  }
}

async function settleOneMatchedSideBet(
  admin: SupabaseClient,
  ctx: {
    bet: SideBetRow;
    bankerDiceResult: string | null;
    bankerDiceName: string | null;
    playerRolls: PlayerRollLite[];
    platformFeePct: number;
    roundId: string;
  }
): Promise<void> {
  const { bet, bankerDiceResult, bankerDiceName, playerRolls, platformFeePct, roundId } =
    ctx;
  const betId = bet.id;
  const amount = Math.max(0, Math.floor(Number(bet.amount_cents) || 0));
  if (amount <= 0) {
    celoAccountingAuditLog("sidebet_settlement_anomaly", {
      betId,
      message: "amount_cents invalid",
    });
    return;
  }
  const acceptorId = bet.acceptor_id;
  if (!acceptorId) {
    celoAccountingAuditLog("sidebet_settlement_anomaly", {
      betId,
      message: "missing acceptor_id",
    });
    return;
  }

  const creatorWins = resolveSideBetCreatorWins({
    betType: bet.bet_type,
    bankerDiceResult,
    bankerDiceName,
    playerRolls,
  });

  const grossPot = amount * 2;
  const feePct = Math.max(0, Math.min(100, Math.floor(platformFeePct)));
  const now = new Date().toISOString();

  if (creatorWins === null) {
    celoAccountingAuditLog("sidebet_settlement_void", {
      betId,
      roundId,
      betType: bet.bet_type,
      bankerDiceResult,
    });
    const refC = CELO_SIDEBET_VOID_REF(betId, "creator");
    const refA = CELO_SIDEBET_VOID_REF(betId, "acceptor");
    const c1 = await creditGpayIdempotent(
      bet.creator_id,
      amount,
      "C-Lo side entry void (refund creator)",
      refC,
      "celo_bank_refund"
    );
    if (!c1.success) {
      celoAccountingAuditLog("sidebet_settlement_void_credit_fail", {
        betId,
        party: "creator",
        message: c1.message,
      });
      return;
    }
    const c2 = await creditGpayIdempotent(
      acceptorId,
      amount,
      "C-Lo side entry void (refund acceptor)",
      refA,
      "celo_bank_refund"
    );
    if (!c2.success) {
      celoAccountingAuditLog("sidebet_settlement_void_credit_fail", {
        betId,
        party: "acceptor",
        message: c2.message,
      });
      return;
    }

    const { data: updated } = await admin
      .from("celo_side_bets")
      .update({
        status: "cancelled",
        winner_id: null,
        payout_cents: 0,
        platform_fee_cents: 0,
        settled_at: now,
      })
      .eq("id", betId)
      .eq("status", "matched")
      .select("id")
      .maybeSingle();

    if (!updated) {
      const { data: cur } = await admin
        .from("celo_side_bets")
        .select("id, status")
        .eq("id", betId)
        .maybeSingle();
      celoAccountingAuditLog("sidebet_settlement_skip_already_done", {
        betId,
        roundId,
        terminalStatus: (cur as { status?: string } | null)?.status,
        path: "void",
      });
      return;
    }
    celoAccountingAuditLog("sidebet_settlement_void_done", {
      betId,
      roundId,
      refundRefs: [refC, refA],
    });
    return;
  }

  const winnerId = creatorWins ? bet.creator_id : acceptorId;
  const fee = Math.floor((grossPot * feePct) / 100);
  const winnerNet = Math.max(0, grossPot - fee);
  const payoutRef = CELO_SIDEBET_PAYOUT_REF(betId);
  const finalStatus = creatorWins ? "won" : "lost";

  celoAccountingAuditLog("sidebet_settlement_payout_attempt", {
    betId,
    roundId,
    winnerId,
    winnerNet,
    payoutRef,
    grossPot,
    fee,
  });

  const cr = await creditGpayIdempotent(
    winnerId,
    winnerNet,
    "C-Lo side entry (settlement winner)",
    payoutRef,
    "celo_payout"
  );
  if (!cr.success) {
    celoAccountingAuditLog("sidebet_settlement_payout_fail", {
      betId,
      roundId,
      message: cr.message,
    });
    return;
  }

  await insertCeloPlatformFee(
    admin,
    fee,
    `C-Lo side entry fee (bet ${betId})`,
    {
      userId: winnerId,
      roundId,
      idempotencyKey: `celo_pf_sidebet_${betId}`,
    }
  );

  const { data: updated } = await admin
    .from("celo_side_bets")
    .update({
      status: finalStatus,
      winner_id: winnerId,
      payout_cents: winnerNet,
      platform_fee_cents: fee,
      settled_at: now,
    })
    .eq("id", betId)
    .eq("status", "matched")
    .select("id")
    .maybeSingle();

  if (!updated) {
    const { data: cur } = await admin
      .from("celo_side_bets")
      .select("id, status, winner_id, payout_cents")
      .eq("id", betId)
      .maybeSingle();
    celoAccountingAuditLog("sidebet_settlement_skip_already_done", {
      betId,
      roundId,
      terminalStatus: (cur as { status?: string } | null)?.status,
      path: "payout",
      payoutRef,
    });
    return;
  }

  celoAccountingAuditLog("sidebet_settlement_done", {
    betId,
    roundId,
    finalStatus,
    winnerId,
    payoutRef,
    winnerNet,
    fee,
  });
  celoAccountingLog("sidebet_settlement_done", {
    betId,
    roundId,
    payoutRef,
  });
}
