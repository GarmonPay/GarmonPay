import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getGpayBalanceSnapshot, gpayLedgerEntry } from "@/lib/gpay-ledger";
import { computePayoutAndHouseCut, flipCoin } from "@/lib/coin-flip";

export async function POST(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { gameId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const gameId = typeof body.gameId === "string" ? body.gameId : null;
  if (!gameId) {
    return NextResponse.json({ message: "gameId required" }, { status: 400 });
  }

  const { data: game, error: fetchErr } = await supabase
    .from("coin_flip_games")
    .select("id, status, mode, bet_amount_minor, creator_id, creator_side")
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
    creator_side: string;
  };

  if (g.mode !== "vs_player" || g.status !== "waiting") {
    return NextResponse.json({ message: "Game is not open for joining" }, { status: 400 });
  }

  if (g.creator_id === userId) {
    return NextResponse.json({ message: "You cannot join your own game" }, { status: 403 });
  }

  const betAmountMinor = Math.trunc(Number(g.bet_amount_minor));
  if (!Number.isFinite(betAmountMinor) || betAmountMinor < 10) {
    return NextResponse.json({ message: "Invalid game stake" }, { status: 400 });
  }

  const snap = await getGpayBalanceSnapshot(userId);
  if (snap.available_minor < betAmountMinor) {
    return NextResponse.json({ message: "Insufficient GPay balance" }, { status: 400 });
  }

  const debit = await gpayLedgerEntry(userId, "game_play", -betAmountMinor, `coin_flip_join_${gameId}`, {
    coin_flip_id: gameId,
    role: "opponent",
  });

  if (!debit.success) {
    return NextResponse.json({ message: debit.message }, { status: 400 });
  }

  const result = flipCoin();
  const creatorWins = result === g.creator_side;
  const winnerId = creatorWins ? g.creator_id : userId;
  const { payoutWinnerMinor, houseCutMinor } = computePayoutAndHouseCut(betAmountMinor);
  const resolvedAt = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from("coin_flip_games")
    .update({
      opponent_id: userId,
      status: "completed",
      result,
      winner_id: winnerId,
      house_cut_minor: houseCutMinor,
      resolved_at: resolvedAt,
    })
    .eq("id", gameId)
    .eq("status", "waiting")
    .neq("creator_id", userId)
    .select("id")
    .maybeSingle();

  if (updErr || !updated) {
    await gpayLedgerEntry(userId, "manual_credit", betAmountMinor, `coin_flip_join_refund_${gameId}_${Date.now()}`, {
      reason: "join_race",
      coin_flip_id: gameId,
    });
    return NextResponse.json({ message: "Game was already taken or cancelled" }, { status: 409 });
  }

  const win = await gpayLedgerEntry(winnerId, "game_win", payoutWinnerMinor, `coin_flip_win_${gameId}`, {
    coin_flip_id: gameId,
    mode: "vs_player",
  });

  if (!win.success) {
    return NextResponse.json({ message: win.message ?? "Payout failed" }, { status: 500 });
  }

  const youWon = winnerId === userId;
  const netMinor = youWon ? payoutWinnerMinor - betAmountMinor : -betAmountMinor;

  const gpayBalanceMinor = userId === winnerId ? win.available_minor : debit.available_minor;

  return NextResponse.json({
    gameId,
    status: "completed",
    result,
    winnerId,
    youWon,
    betAmountMinor,
    payoutWinnerMinor,
    houseCutMinor,
    netMinor,
    gpayBalanceMinor,
  });
}
