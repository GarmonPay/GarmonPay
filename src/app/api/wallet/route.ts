import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getWalletBalanceCents } from "@/lib/wallet-ledger";

/**
 * GET /api/wallet
 * Returns current wallet balance (from wallet_balances). Falls back to 0 if ledger not used.
 */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const balanceCents = await getWalletBalanceCents(userId);
  return NextResponse.json({
    balance_cents: balanceCents ?? 0,
  });
}
