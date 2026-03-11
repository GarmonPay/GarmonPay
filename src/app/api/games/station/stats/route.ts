import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getGlobalRank } from "@/lib/game-station-db";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";

/** GET /api/games/station/stats — balance, global rank for Game Station. */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [balanceCents, rank] = await Promise.all([
      getCanonicalBalanceCents(userId),
      getGlobalRank(userId),
    ]);
    return NextResponse.json({ balance_cents: balanceCents, rank });
  } catch (e) {
    console.error("Game station stats error:", e);
    return NextResponse.json({ balance_cents: 0, rank: null });
  }
}
