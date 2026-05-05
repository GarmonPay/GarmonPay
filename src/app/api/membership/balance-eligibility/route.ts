import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getEligibleUpgradeBalance } from "@/lib/balance-eligibility";
import { PAID_TIER_PRICES_USD, isPaidTierId } from "@/lib/membership-balance-prices";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tier = new URL(req.url).searchParams.get("tier")?.toLowerCase().trim() ?? "";
  const priceUsd = isPaidTierId(tier) ? PAID_TIER_PRICES_USD[tier] : PAID_TIER_PRICES_USD.starter;
  const info = await getEligibleUpgradeBalance(userId, priceUsd);
  return NextResponse.json({
    eligible: info.eligible,
    goldCoins: info.goldCoins,
    shortfall: info.shortfall,
  });
}
