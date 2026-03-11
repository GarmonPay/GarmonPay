import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";
import type { GameSlug } from "@/lib/game-station-db";

const COST: Record<string, number> = {
  runner: 5,
  snake: 5,
  shooter: 5,
  dodge: 5,
  tap: 5,
  memory: 5,
  reaction: 5,
  spin: 0,
  boxing: 0,
};

/** POST /api/games/station/start — deduct credits to start a game. Body: { game_slug }. */
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
  if (!slug || !COST.hasOwnProperty(slug)) {
    return NextResponse.json({ error: "Invalid game_slug" }, { status: 400 });
  }
  const costCents = COST[slug];
  if (costCents > 0) {
    const balance = await getCanonicalBalanceCents(userId);
    if (balance < costCents) {
      return NextResponse.json(
        { error: "Insufficient balance", required_cents: costCents },
        { status: 400 }
      );
    }
    const ref = `game_${slug}_${userId}_${Date.now()}`;
    const result = await walletLedgerEntry(userId, "game_play", -costCents, ref);
    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, balance_cents: result.balance_cents, cost_cents: costCents });
  }
  const balance = await getCanonicalBalanceCents(userId);
  return NextResponse.json({ ok: true, balance_cents: balance, cost_cents: 0 });
}
