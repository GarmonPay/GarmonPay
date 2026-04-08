import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getGpayBalanceSnapshot } from "@/lib/gpay-ledger";

/**
 * GET /api/gpay/balance — authenticated user reads own GPay summary only (Bearer).
 */
export async function GET(request: Request) {
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const snap = await getGpayBalanceSnapshot(userId);
  return NextResponse.json({
    gpayAvailableBalanceMinor: snap.available_minor,
    gpayPendingClaimBalanceMinor: snap.pending_claim_minor,
    gpayClaimedBalanceMinor: snap.claimed_lifetime_minor,
    gpayLifetimeEarnedMinor: snap.lifetime_earned_minor,
  });
}
