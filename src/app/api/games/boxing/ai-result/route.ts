import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

const PLATFORM_FEE_PERCENT = 10;

/**
 * POST /api/games/boxing/ai-result
 * Called when an AI fight ends. If won, credits winner with pot minus 10% platform fee.
 * Saves result in fight_history. Bet was already deducted via place-bet.
 * Body: { won: boolean, bet_amount_cents: number }
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { won?: boolean; bet_amount_cents?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const won = body.won === true;
  const betAmountCents = typeof body.bet_amount_cents === "number" ? Math.round(body.bet_amount_cents) : 0;
  if (!Number.isFinite(betAmountCents) || betAmountCents < 0) {
    return NextResponse.json(
      { error: "bet_amount_cents must be a non-negative number" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const potCents = betAmountCents * 2;
  const platformFeeCents = Math.round(potCents * (PLATFORM_FEE_PERCENT / 100));
  const winnerPayoutCents = potCents - platformFeeCents;

  if (won && winnerPayoutCents > 0) {
    const ref = `fight_ai_win_${userId}_${Date.now()}`;
    const result = await walletLedgerEntry(userId, "game_win", winnerPayoutCents, ref);
    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? "Failed to credit winner" },
        { status: 500 }
      );
    }
    await supabase.from("transactions").insert({
      user_id: userId,
      type: "fight_prize",
      amount: winnerPayoutCents,
      status: "completed",
      description: "Boxing arena AI fight win",
      reference_id: ref,
    }).then(({ error }) => {
      if (error) console.error("[boxing ai-result] transaction insert:", error.message);
    });
  }

  await supabase.from("fight_history").insert({
    player1: userId,
    player2: null,
    winner: won ? userId : null,
    bet_amount_cents: betAmountCents,
    platform_fee_cents: won ? platformFeeCents : 0,
    knockout: won,
  }).then(({ error }) => {
    if (error) console.error("[boxing ai-result] fight_history insert:", error.message);
  });

  const { updateBoxerProfileAfterAiFight } = await import("@/lib/boxer-profile");
  await updateBoxerProfileAfterAiFight(userId, won, won).catch((e) =>
    console.error("[boxing ai-result] updateBoxerProfileAfterAiFight:", e)
  );

  if (won && platformFeeCents > 0) {
    await supabase.from("platform_revenue").insert({
      amount: platformFeeCents,
      source: "boxing_arena_ai",
    }).then(({ error }) => {
      if (error) console.error("[boxing ai-result] platform_revenue insert:", error.message);
    });
  }

  return NextResponse.json({
    success: true,
    won,
    bet_amount_cents: betAmountCents,
    winner_payout_cents: won ? winnerPayoutCents : 0,
    platform_fee_cents: won ? platformFeeCents : 0,
  });
}
