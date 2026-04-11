import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { COIN_FLIP_MIN_BET_SC, computePayoutAndHouseCut, flipCoin, type CoinSide } from "@/lib/coin-flip";
import { creditCoins, debitSweepsCoins, getUserCoins } from "@/lib/coins";

export async function POST(request: Request) {
  const userId = await getAuthUserIdStrict(request);
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
        message: `Invalid body: betAmountMinor is SC (min ${COIN_FLIP_MIN_BET_SC}), side (heads|tails), mode (vs_house|vs_player)`,
      },
      { status: 400 }
    );
  }

  const { sweepsCoins } = await getUserCoins(userId);
  if (sweepsCoins < betAmountSc) {
    return NextResponse.json({ message: "Insufficient Sweeps Coins (SC)" }, { status: 400 });
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
    const debit = await debitSweepsCoins(userId, betAmountSc, `Coin flip stake (create) ${gameId}`, debitRef);

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
      sweepsCoins: after.sweepsCoins,
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
  const debit = await debitSweepsCoins(userId, betAmountSc, `Coin flip stake (vs house) ${gameId}`, debitRef);

  if (!debit.success) {
    await supabase.from("coin_flip_games").update({ status: "cancelled" }).eq("id", gameId);
    return NextResponse.json({ message: debit.message }, { status: 400 });
  }

  const result = flipCoin();
  const creatorWins = result === side;
  const { payoutWinnerMinor, houseCutMinor } = computePayoutAndHouseCut(betAmountSc);
  const winnerId = creatorWins ? userId : null;
  const resolvedAt = new Date().toISOString();

  let sweepsAfter = (await getUserCoins(userId)).sweepsCoins;
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
    sweepsAfter = (await getUserCoins(userId)).sweepsCoins;
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

  const netMinor = creatorWins ? payoutWinnerMinor - betAmountSc : -betAmountSc;

  return NextResponse.json({
    gameId,
    status: "completed",
    mode: "vs_house",
    result,
    creatorSide: side,
    winnerId,
    youWon: creatorWins,
    betAmountMinor: betAmountSc,
    payoutWinnerMinor: creatorWins ? payoutWinnerMinor : 0,
    houseCutMinor,
    netMinor,
    sweepsCoins: sweepsAfter,
    gpayBalanceMinor: 0,
  });
}
