import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getGpayBalanceSnapshot, gpayLedgerEntry } from "@/lib/gpay-ledger";
import { computePayoutAndHouseCut, flipCoin, type CoinSide } from "@/lib/coin-flip";

const MIN_BET = 10;

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
  const betAmountMinor = Math.floor(betRaw);
  const side = body.side === "heads" || body.side === "tails" ? (body.side as CoinSide) : null;
  const mode = body.mode === "vs_house" || body.mode === "vs_player" ? body.mode : null;

  if (!side || !mode || !Number.isFinite(betRaw) || betAmountMinor < MIN_BET) {
    return NextResponse.json(
      { message: `Invalid body: betAmountMinor (min ${MIN_BET}), side (heads|tails), mode (vs_house|vs_player)` },
      { status: 400 }
    );
  }

  const snap = await getGpayBalanceSnapshot(userId);
  if (snap.available_minor < betAmountMinor) {
    return NextResponse.json({ message: "Insufficient GPay balance" }, { status: 400 });
  }

  if (mode === "vs_player") {
    const { data: inserted, error: insErr } = await supabase
      .from("coin_flip_games")
      .insert({
        mode: "vs_player",
        status: "waiting",
        bet_amount_minor: betAmountMinor,
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
    const debit = await gpayLedgerEntry(userId, "game_play", -betAmountMinor, `coin_flip_create_${gameId}`, {
      coin_flip_id: gameId,
      mode: "vs_player",
    });

    if (!debit.success) {
      await supabase.from("coin_flip_games").update({ status: "cancelled" }).eq("id", gameId);
      return NextResponse.json({ message: debit.message }, { status: 400 });
    }

    return NextResponse.json({
      gameId,
      status: "waiting",
      mode: "vs_player",
      betAmountMinor,
      creatorSide: side,
      gpayBalanceMinor: debit.available_minor,
    });
  }

  // vs_house — resolve immediately
  const { data: inserted, error: insErr } = await supabase
    .from("coin_flip_games")
    .insert({
      mode: "vs_house",
      status: "active",
      bet_amount_minor: betAmountMinor,
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
  const debit = await gpayLedgerEntry(userId, "game_play", -betAmountMinor, `coin_flip_create_${gameId}`, {
    coin_flip_id: gameId,
    mode: "vs_house",
  });

  if (!debit.success) {
    await supabase.from("coin_flip_games").update({ status: "cancelled" }).eq("id", gameId);
    return NextResponse.json({ message: debit.message }, { status: 400 });
  }

  const result = flipCoin();
  const creatorWins = result === side;
  const { payoutWinnerMinor, houseCutMinor } = computePayoutAndHouseCut(betAmountMinor);
  const winnerId = creatorWins ? userId : null;
  const resolvedAt = new Date().toISOString();

  let gpayBalanceMinor = debit.available_minor;
  if (creatorWins && payoutWinnerMinor > 0) {
    const win = await gpayLedgerEntry(userId, "game_win", payoutWinnerMinor, `coin_flip_win_${gameId}`, {
      coin_flip_id: gameId,
      mode: "vs_house",
    });
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
    gpayBalanceMinor = win.available_minor;
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

  const netMinor = creatorWins ? payoutWinnerMinor - betAmountMinor : -betAmountMinor;

  return NextResponse.json({
    gameId,
    status: "completed",
    mode: "vs_house",
    result,
    creatorSide: side,
    winnerId,
    youWon: creatorWins,
    betAmountMinor,
    payoutWinnerMinor: creatorWins ? payoutWinnerMinor : 0,
    houseCutMinor,
    netMinor,
    gpayBalanceMinor,
  });
}
