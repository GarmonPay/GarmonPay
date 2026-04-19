import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { computePayoutAndHouseCut } from "@/lib/coin-flip";

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
      "id, created_at, mode, status, bet_amount_minor, creator_id, creator_side, result, winner_id, opponent_id, house_cut_minor, resolved_at"
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
    house_cut_minor: number;
    resolved_at: string | null;
  }>;

  const games = list.map((r) => {
    const bet = Math.trunc(r.bet_amount_minor);
    const { payoutWinnerMinor } = computePayoutAndHouseCut(bet);
    let netMinor = 0;
    let won: boolean | null = null;
    let payoutMinor = 0;

    const youPlay = r.creator_id === userId || r.opponent_id === userId;

    if (r.status === "completed" && youPlay) {
      if (r.winner_id === userId) {
        won = true;
        payoutMinor = payoutWinnerMinor;
        netMinor = payoutWinnerMinor - bet;
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

    return {
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
      houseCutMinor: Math.trunc(Number(r.house_cut_minor ?? 0)),
      resolvedAt: r.resolved_at,
    };
  });

  return NextResponse.json({ games });
}
