import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createPinballSession } from "@/lib/pinball-db";
import { getCanonicalBalanceCents, walletLedgerEntry } from "@/lib/wallet-ledger";

const ENTRY_COST_CENTS = 10;

/** POST /api/games/pinball/start — deduct entry fee, create session. Returns { session_id, balance_cents }. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const balance = await getCanonicalBalanceCents(userId);
  if (balance < ENTRY_COST_CENTS) {
    return NextResponse.json(
      { error: "Insufficient balance", required_cents: ENTRY_COST_CENTS },
      { status: 400 }
    );
  }
  let session: Awaited<ReturnType<typeof createPinballSession>>;
  try {
    session = await createPinballSession(userId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Database error";
    console.error("Pinball start create session error:", e);
    return NextResponse.json(
      { error: "Failed to start game. Run database migrations (e.g. supabase db push).", details: message },
      { status: 500 }
    );
  }
  const ref = `pinball_${userId}_${session.id}`;
  const result = await walletLedgerEntry(userId, "game_play", -ENTRY_COST_CENTS, ref);
  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({
    session_id: session.id,
    balance_cents: result.balance_cents,
    cost_cents: ENTRY_COST_CENTS,
  });
}
