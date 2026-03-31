import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getUsersTableBalanceCents } from "@/lib/wallet-ledger";
/**
 * GET /api/wallet
 * Returns `users.balance` (cents) for the authenticated user. Null in DB → 0.
 */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const balanceCents = await getUsersTableBalanceCents(userId);
  return NextResponse.json({
    balance_cents: balanceCents,
  });
}
