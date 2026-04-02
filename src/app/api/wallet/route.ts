import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";
/**
 * GET /api/wallet
 * Returns canonical balance in cents: `wallet_balances` first (same as Stripe / ledger),
 * then `users.balance`. Matches web dashboard and avoids stale `users.balance` when
 * it drifts from the ledger.
 */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const balanceCents = await getCanonicalBalanceCents(userId);
  return NextResponse.json({
    balance_cents: balanceCents,
  });
}
