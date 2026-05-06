import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getEligibleUpgradeBalance } from "@/lib/balance-eligibility";
import { normalizeUserMembershipTier, membershipTierRank, type MarketingPlanId } from "@/lib/garmon-plan-config";
import {
  PAID_TIER_PRICES_GC,
  PAID_TIER_PRICES_USD,
  isPaidTierId,
  type PaidMembershipTierId,
} from "@/lib/membership-balance-prices";
import { applyMembershipUpgradeAndFirstMonthly, creditMonthlyBonus } from "@/lib/membership-bonus";
import { purchaseMembershipWithBalance } from "@/lib/membership-purchase-balance";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tier?: string; renew?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const renew = body.renew === true;
  const tierRaw = (body.tier ?? "").toLowerCase().trim();
  if (!isPaidTierId(tierRaw)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }
  const tier: PaidMembershipTierId = tierRaw;
  // Rounded-up GC pricing from $9.99/$24.99/$49.99/$99.99 for integer-only debits.
  // This intentional $0.01 platform-favorable rounding prevents fractional shortfalls.
  const tierPriceGc = PAID_TIER_PRICES_GC[tier];
  const tierPriceUsd = PAID_TIER_PRICES_USD[tier];

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: userRow, error: userErr } = await admin
    .from("users")
    .select("membership, membership_tier, membership_expires_at, membership_payment_source")
    .eq("id", userId)
    .single();
  if (userErr || !userRow) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const prevExpiresAt =
    typeof (userRow as { membership_expires_at?: string | null }).membership_expires_at === "string"
      ? (userRow as { membership_expires_at: string }).membership_expires_at
      : null;

  const rawMembership = (userRow as { membership?: string | null; membership_tier?: string | null }).membership ?? "";
  const currentTier = normalizeUserMembershipTier(rawMembership);
  const paymentSource = (userRow as { membership_payment_source?: string | null }).membership_payment_source ?? null;
  if (renew) {
    if (membershipTierRank(currentTier) <= membershipTierRank("free")) {
      return NextResponse.json({ error: "No active paid membership to renew." }, { status: 400 });
    }
    if (tier !== currentTier) {
      return NextResponse.json({ error: "Renewal must match your current tier." }, { status: 400 });
    }
    if (paymentSource !== "balance") {
      return NextResponse.json(
        { error: "Balance renewal applies to memberships paid with balance." },
        { status: 400 }
      );
    }
  } else if (membershipTierRank(tier) <= membershipTierRank(currentTier)) {
    return NextResponse.json(
      { error: "You can only upgrade to a higher tier using balance." },
      { status: 400 }
    );
  }

  const balanceInfo = await getEligibleUpgradeBalance(userId, tierPriceUsd);
  if (!balanceInfo.eligible) {
    return NextResponse.json(
      {
        error: `Insufficient Gold Coins (have ${balanceInfo.goldCoins}, need ${tierPriceGc})`,
        eligible: balanceInfo.eligible,
        goldCoins: balanceInfo.goldCoins,
        shortfall: balanceInfo.shortfall,
      },
      { status: 400 }
    );
  }

  const purchase = await purchaseMembershipWithBalance(
    admin,
    userId,
    tier,
    tierPriceGc,
    renew ? prevExpiresAt : null
  );
  if (!purchase.success) {
    return NextResponse.json({ error: purchase.message }, { status: 400 });
  }
  const expiresIso = purchase.period_end;

  const bonusRef = renew
    ? `membership_renew_${tier}_${Date.now()}`
    : `membership_upgrade_${tier}_${Date.now()}`;

  let gpcBonus = 0;
  if (renew) {
    const mo = await creditMonthlyBonus(admin, userId, tier, bonusRef);
    if (mo.success) gpcBonus = mo.gpcCredited ?? 0;
  } else {
    const prev = currentTier;
    const totals = await applyMembershipUpgradeAndFirstMonthly(admin, userId, prev, tier, bonusRef);
    gpcBonus = totals.upgradeGpc + totals.monthlyGpc;
  }

  const newGoldCoins = purchase.remaining_gold;

  return NextResponse.json({
    success: true,
    newTier: tier as MarketingPlanId,
    amountChargedGc: tierPriceGc,
    expiresAt: expiresIso,
    newGoldCoins,
    gpcBonus: renew ? 0 : gpcBonus,
  });
}
