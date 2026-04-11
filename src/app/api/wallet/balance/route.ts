import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getCanonicalBalanceCents } from "@/lib/wallet-ledger";

/** GET /api/wallet/balance — canonical USD wallet balance (cents). */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const balance = await getCanonicalBalanceCents(userId);
  return NextResponse.json({
    balance_cents: balance,
    balance_dollars: balance / 100,
  });
}
