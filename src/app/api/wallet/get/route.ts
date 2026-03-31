import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getUsersTableBalanceCents } from "@/lib/wallet-ledger";

/**
 * GET /api/wallet/get
 * Returns `users.balance` (cents). Same source as dashboard wallet display.
 */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const balanceCents = await getUsersTableBalanceCents(userId);
  return NextResponse.json({ balance_cents: balanceCents });
}
