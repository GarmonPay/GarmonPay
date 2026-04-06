import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getEligibleUpgradeBalance } from "@/lib/balance-eligibility";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const info = await getEligibleUpgradeBalance(userId);
  return NextResponse.json({
    totalBalance: info.totalBalance,
    eligibleBalance: info.eligibleBalance,
    heldBalance: info.heldBalance,
    heldUntil: info.heldUntil ? info.heldUntil.toISOString() : null,
  });
}
