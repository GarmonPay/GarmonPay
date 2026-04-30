import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { COIN_FLIP_MIN_BET_SC, type CoinSide } from "@/lib/coin-flip";
import { debitGpayCoins, getUserCoins } from "@/lib/coins";

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
  const requestedMode =
    typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "";
  console.log("[Coin Flip mode guard]", {
    requestedMode,
    allowedMode: "pvp",
    rejected: requestedMode !== "vs_player",
  });
  const mode = requestedMode === "vs_player" ? "vs_player" : null;

  if (!side || !Number.isFinite(betRaw) || betAmountSc < COIN_FLIP_MIN_BET_SC) {
    return NextResponse.json(
      {
        message: `Invalid body: betAmountMinor is GPC (min ${COIN_FLIP_MIN_BET_SC}), side (heads|tails), mode (vs_player)`,
      },
      { status: 400 }
    );
  }
  if (!mode) {
    return NextResponse.json(
      { message: "Player vs House mode is no longer supported." },
      { status: 400 }
    );
  }

  const { gpayCoins } = await getUserCoins(userId);
  if (gpayCoins < betAmountSc) {
    return NextResponse.json({ message: "Insufficient GPay Coins (GPC)" }, { status: 400 });
  }

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
