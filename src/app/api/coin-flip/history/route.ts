import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { computePvpCoinFlipSettlement } from "@/lib/coin-flip";

export async function GET(request: Request) {
  const userId = await getAuthUserIdBearerOrCookie(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: rows, error } = await supabase
    .from("coin_flip_games")
    .select(
      "id, created_at, mode, status, bet_amount_minor, creator_id, creator_side, result, winner_id, opponent_id, loser_user_id, house_cut_minor, total_pot_minor, winner_payout_minor, resolved_at, settled_at"
    )
    .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as Array<{
    id: string;
    created_at: string;
    mode: string;
    status: string;
    bet_amount_minor: number;
    creator_id: string;
    creator_side: string;
    result: string | null;
    winner_id: string | null;
    opponent_id: string | null;
    loser_user_id: string | null;
    house_cut_minor: number | null;
    total_pot_minor: number | null;
    winner_payout_minor: number | null;
    resolved_at: string | null;
    settled_at: string | null;
  }>;

  const games = list.map((r) => {
    const bet = Math.trunc(r.bet_amount_minor);
    const derived = computePvpCoinFlipSettlement(bet);
    const totalPotMinor =
      r.total_pot_minor != null && Number.isFinite(Number(r.total_pot_minor))
        ? Math.trunc(Number(r.total_pot_minor))
        : derived.totalPotGpc;
    const platformFeeMinor =
      r.house_cut_minor != null && Number.isFinite(Number(r.house_cut_minor))
        ? Math.trunc(Number(r.house_cut_minor))
        : derived.platformFeeGpc;
    const winnerPayoutMinor =
      r.winner_payout_minor != null && Number.isFinite(Number(r.winner_payout_minor))
        ? Math.trunc(Number(r.winner_payout_minor))
        : derived.winnerPayoutGpc;

    let netMinor = 0;
    let won: boolean | null = null;
    let payoutMinor = 0;

    const youPlay = r.creator_id === userId || r.opponent_id === userId;

    if (r.status === "completed" && youPlay) {
      if (r.winner_id === userId) {
        won = true;
        payoutMinor = winnerPayoutMinor;
        netMinor = winnerPayoutMinor - bet;
      } else {
        won = false;
        netMinor = -bet;
      }
    } else if (r.status === "waiting" || r.status === "active") {
      won = null;
      netMinor = 0;
    } else {
      won = null;
      netMinor = 0;
    }

    const row: Record<string, unknown> = {
      id: r.id,
      createdAt: r.created_at,
      mode: r.mode,
      status: r.status,
      betAmountMinor: bet,
      result: r.result,
      creatorSide: r.creator_side,
      won,
      payoutMinor,
      netMinor,
      resolvedAt: r.resolved_at,
      settledAt: r.settled_at ?? r.resolved_at,
    };
    if (r.status === "completed") {
      row.totalPotMinor = totalPotMinor;
      row.platformFeeMinor = platformFeeMinor;
      row.winnerPayoutMinor = winnerPayoutMinor;
    }
    return row;
  });

  return NextResponse.json({ games });
}
