import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getUserCoins, debitSweepsCoins } from "@/lib/coins";
import type { GameSlug } from "@/lib/game-station-db";

/** Per-play cost in GPay Coins / GPC (not USD cents). */
const COST_SC: Record<string, number> = {
  runner: 5,
  snake: 5,
  shooter: 5,
  dodge: 5,
  tap: 5,
  memory: 5,
  reaction: 5,
  spin: 0,
};

/** POST /api/games/station/start — deduct GPC to start a game. Body: { game_slug }. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { game_slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const slug = typeof body.game_slug === "string" ? body.game_slug.trim() as GameSlug : null;
  if (!slug || !COST_SC.hasOwnProperty(slug)) {
    return NextResponse.json({ error: "Invalid game_slug" }, { status: 400 });
  }
  const costSc = COST_SC[slug];
  if (costSc > 0) {
    const ref = `game_station_${slug}_${userId}_${Date.now()}`;
    const result = await debitSweepsCoins(userId, costSc, `Game Station: ${slug}`, ref);
    if (!result.success) {
      return NextResponse.json(
        { error: result.message ?? "Insufficient GPay Coins", required_sc: costSc },
        { status: 400 }
      );
    }
    const { sweepsCoins } = await getUserCoins(userId);
    return NextResponse.json({ ok: true, sweeps_coins: sweepsCoins, cost_sc: costSc });
  }
  const { sweepsCoins } = await getUserCoins(userId);
  return NextResponse.json({ ok: true, sweeps_coins: sweepsCoins, cost_sc: 0 });
}
