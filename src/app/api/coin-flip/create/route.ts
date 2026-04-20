import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { COIN_FLIP_MIN_BET_SC, computePayoutAndHouseCut, flipCoin, type CoinSide } from "@/lib/coin-flip";
import { insertCoinFlipPlatformFee } from "@/lib/coin-flip-ledger";
import { creditCoins, debitGpayCoins, getUserCoins } from "@/lib/coins";

export async function POST(request: Request) {
  const userId = await getAuthUserIdBearerOrCookie(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { betAmountMinor?: unknown; side?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const betRaw = Number(body.betAmountMinor);
  const betAmountSc = Math.floor(betRaw);
  const side = body.side === "heads" || body.side === "tails" ? (body.side as CoinSide) : null;
  const mode = body.mode === "vs_house" || body.mode === "vs_player" ? body.mode : null;

  if (!side || !mode || !Number.isFinite(betRaw) || betAmountSc < COIN_FLIP_MIN_BET_SC) {
    return NextResponse.json(
      {
        message: `Invalid body: betAmountMinor is GPC (min ${COIN_FLIP_MIN_BET_SC}), side (heads|tails), mode (vs_house|vs_player)`,
      },
      { status: 400 }
    );
  }

  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < betAmountSc) {
    return NextResponse.json({ message: "Insufficient GPay Coins (GPC)" }, { status: 400 });
  }

  if (mode === "vs_player") {
    const { data: inserted, error: insErr } = await supabase
      .from("coin_flip_games")
      .insert({
        mode: "vs_player",
        status: "waiting",
        bet_amount_minor: betAmountSc,
        house_cut_minor: 0,
        creator_id: userId,
        creator_side: side,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json({ message: insErr?.message ?? "Failed to create game" }, { status: 500 });
    }

    const gameId = (inserted as { id: string }).id;
    const debitRef = `coin_flip_create_${gameId}`;
    const debit = await debitGpayCoins(
      userId,
      betAmountSc,
      `Coin flip stake (create) ${gameId}`,
      debitRef,
      "coin_flip_stake"
    );

    if (!debit.success) {
      await supabase.from("coin_flip_games").update({ status: "cancelled" }).eq("id", gameId);
      return NextResponse.json({ message: debit.message }, { status: 400 });
    }

    const after = await getUserCoins(userId);
    return NextResponse.json({
      gameId,
      status: "waiting",
      mode: "vs_player",
      betAmountMinor: betAmountSc,
      creatorSide: side,
      gpayCoins: after.gpayCoins,
      gpayBalanceMinor: 0,
    });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("coin_flip_games")
    .insert({
      mode: "vs_house",
      status: "active",
      bet_amount_minor: betAmountSc,
      house_cut_minor: 0,
      creator_id: userId,
      creator_side: side,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return NextResponse.json({ message: insErr?.message ?? "Failed to create game" }, { status: 500 });
  }

  const gameId = (inserted as { id: string }).id;
  const debitRef = `coin_flip_create_${gameId}`;
  const debit = await debitGpayCoins(
    userId,
    betAmountSc,
    `Coin flip stake (vs house) ${gameId}`,
    debitRef,
    "coin_flip_stake"
  );

  if (!debit.success) {
    await supabase.from("coin_flip_games").update({ status: "cancelled" }).eq("id", gameId);
    console.warn("[coin-flip/create] vs_house debit failed", { gameId, userId, betAmountSc, message: debit.message });
    return NextResponse.json(
      { ok: false, message: debit.message ?? "Failed to debit user balance" },
      { status: 400 }
    );
  }

  const afterDebit = await getUserCoins(userId);
  console.info("[coin-flip/create] vs_house debited", {
    gameId,
    userId,
    betAmountSc,
    gpayCoinsAfterDebit: afterDebit.gpayCoins,
  });

  const result = flipCoin();
  const creatorWins = result === side;
  const { payoutWinnerMinor, houseCutMinor } = computePayoutAndHouseCut(betAmountSc);
  const winnerId = creatorWins ? userId : null;
  const resolvedAt = new Date().toISOString();

  let gpayAfter = (await getUserCoins(userId)).gpayCoins;
  if (creatorWins && payoutWinnerMinor > 0) {
    const winRef = `coin_flip_win_${gameId}`;
    const win = await creditCoins(
      userId,
      0,
      payoutWinnerMinor,
      `Coin flip win (vs house) ${gameId}`,
      winRef,
      "coin_flip_win"
    );
    if (!win.success) {
      await supabase
        .from("coin_flip_games")
        .update({
          status: "completed",
          result,
          winner_id: winnerId,
          house_cut_minor: houseCutMinor,
          resolved_at: resolvedAt,
        })
        .eq("id", gameId);
      return NextResponse.json({ message: win.message ?? "Payout failed" }, { status: 500 });
    }
    gpayAfter = (await getUserCoins(userId)).gpayCoins;
  }

  await supabase
    .from("coin_flip_games")
    .update({
      status: "completed",
      result,
      winner_id: winnerId,
      house_cut_minor: houseCutMinor,
      resolved_at: resolvedAt,
    })
    .eq("id", gameId);

  await insertCoinFlipPlatformFee(supabase, gameId, houseCutMinor, { userId });

  const netMinor = creatorWins ? payoutWinnerMinor - betAmountSc : -betAmountSc;
  const netMinorInt = Math.trunc(netMinor);
  const gpayAfterInt = Math.max(0, Math.trunc(gpayAfter));

  console.info("[coin-flip/create] vs_house complete", {
    gameId,
    userId,
    outcome: creatorWins ? "win" : "loss",
    netMinor,
    gpayCoinsFinal: gpayAfter,
  });

  return NextResponse.json({
    ok: true,
    gameId,
    status: "completed",
    mode: "vs_house",
    outcome: creatorWins ? "win" : "loss",
    result,
    creatorSide: side,
    winnerId,
    youWon: creatorWins,
    betAmountMinor: betAmountSc,
    payoutWinnerMinor: creatorWins ? payoutWinnerMinor : 0,
    houseCutMinor,
    netMinor: netMinorInt,
    amount_won: creatorWins ? Math.trunc(payoutWinnerMinor) : 0,
    amount_lost: creatorWins ? 0 : Math.trunc(betAmountSc),
    new_balance: gpayAfterInt,
    gpayCoins: gpayAfterInt,
    gpayBalanceMinor: 0,
  });
}
