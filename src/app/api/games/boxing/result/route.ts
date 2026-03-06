import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

/**
 * POST /api/games/boxing/result
 * Called when a 3D boxing match ends. Credits winner, records transaction.
 * Body: { winner_id: string, loser_id: string, bet_amount: number (cents) }
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { winner_id?: string; loser_id?: string; bet_amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const winner_id = typeof body.winner_id === "string" ? body.winner_id.trim() : null;
  const loser_id = typeof body.loser_id === "string" ? body.loser_id.trim() : null;
  const bet_amount = typeof body.bet_amount === "number" ? Math.round(body.bet_amount) : 0;

  if (!winner_id || !loser_id) {
    return NextResponse.json(
      { error: "winner_id and loser_id required" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(bet_amount) || bet_amount < 0) {
    return NextResponse.json(
      { error: "bet_amount must be a non-negative number (cents)" },
      { status: 400 }
    );
  }

  if (userId !== winner_id && userId !== loser_id) {
    return NextResponse.json(
      { error: "Only winner or loser can submit this result" },
      { status: 403 }
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const potCents = bet_amount * 2;
  const platformFeeCents = Math.round(potCents * 0.1);
  const winnerPayoutCents = potCents - platformFeeCents;

  if (winnerPayoutCents > 0) {
    const ref = `boxing_result_${winner_id}_${loser_id}_${Date.now()}`;
    const result = await walletLedgerEntry(
      winner_id,
      "game_win",
      winnerPayoutCents,
      ref
    );
    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? "Failed to credit winner" },
        { status: 500 }
      );
    }
  }

  await supabase.from("transactions").insert({
    user_id: winner_id,
    type: "game_win",
    amount: winnerPayoutCents,
    status: "completed",
    description: "Boxing match win",
    reference_id: `boxing_${loser_id}_${Date.now()}`,
  }).then(({ error }) => {
    if (error) console.error("[boxing result] transaction insert:", error.message);
  });

  return NextResponse.json({
    success: true,
    winner_id,
    loser_id,
    winner_payout_cents: winnerPayoutCents,
  });
}
