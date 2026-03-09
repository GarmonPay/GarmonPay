import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";

/**
 * GET /api/wallet/get
 * Returns current wallet balance (canonical). Same source as dashboard and Fight Arena.
 */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const balanceCents = await getCanonicalBalanceCents(userId);
  return NextResponse.json({ balance_cents: balanceCents });
}
