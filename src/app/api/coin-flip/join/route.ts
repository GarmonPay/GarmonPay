import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import {
  computePvpCoinFlipSettlement,
  flipCoin,
  COIN_FLIP_MIN_BET_SC,
  REFERRAL_FLIP_STAKE_GPC,
  type CoinSide,
} from "@/lib/coin-flip";
import { recordCoinFlipPvpPlatformFee } from "@/lib/coin-flip-ledger";
import { creditGpayIdempotent, debitGpayCoins, getUserCoins } from "@/lib/coins";

const BUY_GOLD_URL = "/dashboard/buy-coins";

function isDuplicateLedgerMessage(message: string | undefined): boolean {
  return typeof message === "string" && message.toLowerCase().includes("duplicate");
}

function insufficientGpcResponse(needGpc: number, isReferralFlip: boolean) {
  return NextResponse.json(
    {
      message: `Insufficient GPay Coins. You need ${needGpc} GPC to join${isReferralFlip ? " this invite flip" : ""}. Buy Gold Coins and convert to GPC to play.`,
      code: "INSUFFICIENT_GPC",
      buyGoldUrl: BUY_GOLD_URL,
    },
    { status: 400 }
  );
}

/** Join stake debit: idempotent retry when stake already recorded; fresh ref after race refund. */
async function debitCoinFlipJoinStake(
  supabase: SupabaseClient,
  userId: string,
  gameId: string,
  betAmountSc: number
): Promise<{ success: boolean; message?: string; debitReference?: string }> {
  const baseRef = `coin_flip_join_${gameId}`;
  const baseRefundRef = `coin_flip_join_refund_${gameId}`;

  const attemptDebit = async (reference: string) => {
    const result = await debitGpayCoins(
      userId,
      betAmountSc,
      `Coin flip stake (join) ${gameId}`,
      reference,
      "coin_flip_stake"
    );
    return { ...result, debitReference: result.success ? reference : undefined };
  };

  let debit = await attemptDebit(baseRef);
  if (debit.success) return debit;
  if (!isDuplicateLedgerMessage(debit.message)) return debit;

  const { data: stakeTx } = await supabase
    .from("coin_transactions")
    .select("id")
    .eq("reference", baseRef)
    .eq("user_id", userId)
    .maybeSingle();

  if (!stakeTx) return debit;

  const { data: refundTx } = await supabase
    .from("coin_transactions")
    .select("id")
    .eq("reference", baseRefundRef)
    .eq("user_id", userId)
    .maybeSingle();

  if (refundTx) {
    const retryRef = `${baseRef}_r_${Date.now()}`;
    return attemptDebit(retryRef);
  }

  // Stake recorded, not refunded — safe to continue settlement (retry after failed update).
  return { success: true, debitReference: baseRef };
}

function joinRefundReference(debitReference: string): string {
  return debitReference.replace(/^coin_flip_join_/, "coin_flip_join_refund_");
}

function oppositeSide(side: CoinSide): CoinSide {
  return side === "heads" ? "tails" : "heads";
}

export async function POST(request: Request) {
  const userId = await getAuthUserIdBearerOrCookie(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { gameId?: unknown; side?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const gameId = typeof body.gameId === "string" ? body.gameId : null;
  if (!gameId) {
    return NextResponse.json({ message: "gameId required" }, { status: 400 });
  }

  const joinSide =
    body.side === "heads" || body.side === "tails" ? (body.side as CoinSide) : null;

  const { data: game, error: fetchErr } = await supabase
    .from("coin_flip_games")
    .select("id, status, mode, bet_amount_minor, creator_id, creator_side, is_referral_flip")
    .eq("id", gameId)
    .maybeSingle();

  if (fetchErr || !game) {
    return NextResponse.json({ message: "Game not found" }, { status: 404 });
  }

  const g = game as {
    id: string;
    status: string;
    mode: string;
    bet_amount_minor: number;
    creator_id: string;
    creator_side: string | null;
    is_referral_flip: boolean;
  };

  if (g.mode !== "vs_player" || g.status !== "waiting") {
    return NextResponse.json({ message: "Game is not open for joining" }, { status: 400 });
  }

  if (g.creator_id === userId) {
    return NextResponse.json({ message: "You cannot join your own game" }, { status: 403 });
  }

  const isReferralFlip = !!g.is_referral_flip;
  const betAmountSc = Math.trunc(Number(g.bet_amount_minor));

  if (isReferralFlip) {
    if (!joinSide) {
      return NextResponse.json(
        { message: "side (heads|tails) required for referral invite flips" },
        { status: 400 }
      );
    }
    if (betAmountSc !== REFERRAL_FLIP_STAKE_GPC) {
      return NextResponse.json({ message: "Invalid referral flip stake" }, { status: 400 });
    }
    if (g.creator_side != null && g.creator_side !== oppositeSide(joinSide)) {
      return NextResponse.json({ message: "Side conflict for this game" }, { status: 409 });
    }
  } else {
    if (!Number.isFinite(betAmountSc) || betAmountSc < COIN_FLIP_MIN_BET_SC) {
      return NextResponse.json({ message: "Invalid game stake" }, { status: 400 });
    }
    if (g.creator_side !== "heads" && g.creator_side !== "tails") {
      return NextResponse.json({ message: "Invalid game configuration" }, { status: 400 });
    }
  }

  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < betAmountSc) {
    return insufficientGpcResponse(betAmountSc, isReferralFlip);
  }

  const debit = await debitCoinFlipJoinStake(supabase, userId, gameId, betAmountSc);

  if (!debit.success) {
    console.warn("[coin-flip/join] debit failed", { gameId, userId, betAmountSc, message: debit.message });
    return NextResponse.json(
      { ok: false, message: debit.message ?? "Failed to debit user balance" },
      { status: 400 }
    );
  }

  const debitReference = debit.debitReference ?? `coin_flip_join_${gameId}`;

  const afterDebit = await getUserCoins(userId);
  console.info("[coin-flip/join] joiner debited", {
    gameId,
    userId,
    betAmountSc,
    gpayCoinsAfterDebit: afterDebit.gpayCoins,
  });

  const creatorSide: CoinSide = isReferralFlip
    ? oppositeSide(joinSide!)
    : (g.creator_side as CoinSide);

  const result = flipCoin();
  const creatorWins = result === creatorSide;
  const winnerId = creatorWins ? g.creator_id : userId;
  const loserId = creatorWins ? userId : g.creator_id;

  const { totalPotGpc, platformFeeGpc, winnerPayoutGpc } = computePvpCoinFlipSettlement(betAmountSc);

  const resolvedAt = new Date().toISOString();

  const updatePayload: Record<string, unknown> = {
    opponent_id: userId,
    status: "completed",
    result,
    winner_id: winnerId,
    loser_user_id: loserId,
    house_cut_minor: platformFeeGpc,
    total_pot_minor: totalPotGpc,
    winner_payout_minor: winnerPayoutGpc,
    resolved_at: resolvedAt,
    settled_at: resolvedAt,
  };
  if (isReferralFlip) {
    updatePayload.creator_side = creatorSide;
  }

  const { data: updated, error: updErr } = await supabase
    .from("coin_flip_games")
    .update(updatePayload)
    .eq("id", gameId)
    .eq("status", "waiting")
    .neq("creator_id", userId)
    .select("id")
    .maybeSingle();

  if (updErr || !updated) {
    console.error("[coin-flip/join] game update failed", {
      gameId,
      userId,
      updErr: updErr?.message,
      code: (updErr as { code?: string } | null)?.code,
    });
    const refund = await creditGpayIdempotent(
      userId,
      betAmountSc,
      `Coin flip join refund (race) ${gameId}`,
      joinRefundReference(debitReference),
      "coin_flip_refund"
    );
    if (!refund.success) {
      console.error("[coin-flip/join] refund failed", refund.message);
    }
    return NextResponse.json({ message: "Game was already taken or cancelled" }, { status: 409 });
  }

  console.log("[CoinFlip:Settle]", {
    flipId: gameId,
    winnerId,
    totalPotGpc,
    platformFeeGpc,
    winnerPayoutGpc,
  });

  const winRef = `coinflip_win_${gameId}`;
  const win = await creditGpayIdempotent(
    winnerId,
    winnerPayoutGpc,
    `Coin flip win ${gameId}`,
    winRef,
    "coinflip_win"
  );

  if (!win.success) {
    return NextResponse.json({ message: win.message ?? "Payout failed" }, { status: 500 });
  }

  const feeKey = `coinflip_fee_${gameId}`;
  const feeRes = await recordCoinFlipPvpPlatformFee(supabase, gameId, platformFeeGpc, winnerId, feeKey);
  if (!feeRes.ok) {
    console.error("[coin-flip/join] platform fee record failed", feeRes.message);
    return NextResponse.json({ message: feeRes.message ?? "Fee ledger failed" }, { status: 500 });
  }

  const youWon = winnerId === userId;
  const netMinor = youWon ? winnerPayoutGpc - betAmountSc : -betAmountSc;
  const netMinorInt = Math.trunc(netMinor);
  const after = await getUserCoins(userId);
  const afterInt = Math.max(0, Math.trunc(after.gpayCoins));

  console.info("[coin-flip/join] complete", {
    gameId,
    userId,
    youWon,
    netMinor,
    gpayCoinsFinal: after.gpayCoins,
  });

  return NextResponse.json({
    ok: true,
    gameId,
    status: "completed",
    outcome: youWon ? "win" : "loss",
    result,
    winnerId,
    youWon,
    betAmountMinor: betAmountSc,
    totalPotGpc,
    platformFeeGpc,
    winnerPayoutGpc,
    payoutWinnerMinor: winnerPayoutGpc,
    houseCutMinor: platformFeeGpc,
    netMinor: netMinorInt,
    amount_won: youWon ? Math.trunc(winnerPayoutGpc) : 0,
    amount_lost: youWon ? 0 : Math.trunc(betAmountSc),
    new_balance: afterInt,
    gpayCoins: afterInt,
    gpayBalanceMinor: 0,
  });
}
