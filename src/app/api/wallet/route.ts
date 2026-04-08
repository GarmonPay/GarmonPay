import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";
/**
 * GET /api/wallet
 * Returns canonical balance in cents from `wallet_balances` (same source as
 * `wallet_ledger_entry` and GET /api/dashboard `balanceCents`).
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
