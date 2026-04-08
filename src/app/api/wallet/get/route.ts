import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";

/**
 * GET /api/wallet/get
 * Canonical balance in cents from `wallet_balances` — same source as
 * `/api/wallet`, `/api/celo/room/create`, and ledger-backed flows.
 */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const balanceCents = await getCanonicalBalanceCents(userId);
  return NextResponse.json({ balance_cents: balanceCents });
}
