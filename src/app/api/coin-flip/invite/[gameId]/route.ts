import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { REFERRAL_FLIP_STAKE_GPC } from "@/lib/coin-flip";

/** Public preview for referral-flip invite landing (no auth). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await context.params;
  const id = typeof gameId === "string" ? gameId.trim() : "";
  if (!id) {
    return NextResponse.json({ valid: false, message: "Invalid game" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: game, error } = await supabase
    .from("coin_flip_games")
    .select("id, status, is_referral_flip, bet_amount_minor")
    .eq("id", id)
    .maybeSingle();

  if (error || !game) {
    return NextResponse.json({ valid: false, message: "Game not found" }, { status: 404 });
  }

  const g = game as {
    id: string;
    status: string;
    is_referral_flip: boolean;
    bet_amount_minor: number;
  };

  const valid =
    g.is_referral_flip &&
    g.status === "waiting" &&
    Math.trunc(Number(g.bet_amount_minor)) === REFERRAL_FLIP_STAKE_GPC;

  return NextResponse.json({
    valid,
    gameId: g.id,
    status: g.status,
    isReferralFlip: !!g.is_referral_flip,
    betAmountMinor: Math.trunc(Number(g.bet_amount_minor)),
    stakeGpc: REFERRAL_FLIP_STAKE_GPC,
  });
}
