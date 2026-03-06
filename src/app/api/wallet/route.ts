import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";
/**
 * GET /api/wallet
 * Returns current wallet balance (canonical: wallet_balances then users.balance).
 * Same source as dashboard and Fight Arena betting.
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
