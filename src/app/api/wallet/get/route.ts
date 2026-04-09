import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";

/**
 * GET /api/wallet/get
 * Canonical USD balance in cents: latest `wallet_ledger.balance_after` via
 * `getCanonicalBalanceCents` (same as `/api/wallet` and C-Lo APIs).
 */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const balanceCents = await getCanonicalBalanceCents(userId);
  return NextResponse.json({ balance_cents: balanceCents });
}
