import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { debitGpayCoins, getUserCoins } from "@/lib/coins";

const ODDS: Record<string, number> = {
  celo: 8.0,
  shit: 8.0,
  hand_crack: 4.5,
  trips: 8.0,
  banker_wins: 1.8,
  player_wins: 1.8,
  specific_point: 6.0,
};

export async function POST(req: Request) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: {
    room_id?: unknown;
    round_id?: unknown;
    bet_type?: unknown;
    amount_sc?: unknown;
    specific_point?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  const roundId = typeof body.round_id === "string" ? body.round_id : null;
  const betType = typeof body.bet_type === "string" ? body.bet_type : "";
  const amount = Math.floor(Number(body.amount_sc));
  const specificPoint =
    body.specific_point != null ? Math.floor(Number(body.specific_point)) : null;

  if (!roomId || !roundId || !betType) {
    return NextResponse.json({ message: "room_id, round_id, and bet_type required" }, { status: 400 });
  }

  if (!ODDS[betType]) {
    return NextResponse.json({ message: "Invalid bet_type" }, { status: 400 });
  }

  if (betType === "specific_point") {
    if (specificPoint == null || Number.isNaN(specificPoint) || specificPoint < 2 || specificPoint > 6) {
      return NextResponse.json({ message: "specific_point (2–6) required for this bet type" }, { status: 400 });
    }
  }

  if (!Number.isFinite(amount) || amount < 100 || amount % 100 !== 0) {
    return NextResponse.json({ message: "amount_sc must be ≥ 100 and a multiple of 100 GPC" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const { data: mem } = await supabase.from("celo_room_players").select("id").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
  if (!mem) return NextResponse.json({ message: "Join the room first" }, { status: 403 });

  const { data: round } = await supabase.from("celo_rounds").select("status").eq("id", roundId).maybeSingle();
  if (!round || (round as { status: string }).status === "completed") {
    return NextResponse.json({ message: "Round is not active" }, { status: 400 });
  }

  const { count } = await supabase
    .from("celo_side_bets")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .eq("creator_id", userId)
    .eq("status", "open");

  if ((count ?? 0) >= 5) {
    return NextResponse.json({ message: "Maximum open side entries reached" }, { status: 400 });
  }

  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < amount) {
    return NextResponse.json({ message: "Insufficient GPay Coins (GPC)" }, { status: 400 });
  }

  const debitRef = `celo_side_create_${roomId}_${roundId}_${userId}_${Date.now()}`;
  const debit = await debitGpayCoins(userId, amount, "C-Lo side entry (post)", debitRef, "celo_sidebet");
  if (!debit.success) {
    return NextResponse.json({ message: debit.message ?? "Debit failed" }, { status: 400 });
  }

  const expires = new Date(Date.now() + 60_000).toISOString();

  const insertPayload: Record<string, unknown> = {
    room_id: roomId,
    round_id: roundId,
    creator_id: userId,
    bet_type: betType,
    amount_cents: amount,
    odds_multiplier: ODDS[betType],
    status: "open",
    expires_at: expires,
  };
  if (betType === "specific_point" && specificPoint != null) {
    insertPayload.specific_point = specificPoint;
  }

  const { data: bet, error: insErr } = await supabase.from("celo_side_bets").insert(insertPayload).select("*").single();

  if (insErr || !bet) {
    return NextResponse.json({ message: insErr?.message ?? "Failed to post side entry" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sideBet: bet,
    gpayCoins: (await getUserCoins(userId)).gpayCoins,
  });
}
