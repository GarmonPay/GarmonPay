import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getEligibleUpgradeBalance } from "@/lib/balance-eligibility";
import {
  ensureWalletBalancesRow,
  getCanonicalBalanceCents,
  walletLedgerEntry,
} from "@/lib/wallet-ledger";
import { normalizeUserMembershipTier, membershipTierRank, type MarketingPlanId } from "@/lib/garmon-plan-config";
import { PAID_TIER_PRICES_CENTS, isPaidTierId, type PaidMembershipTierId } from "@/lib/membership-balance-prices";
import { applyMembershipUpgradeAndFirstMonthly, creditMonthlyBonus } from "@/lib/membership-bonus";

export const runtime = "nodejs";

const RENEWAL_MS = 30 * 24 * 60 * 60 * 1000;

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
  const tierPrice = PAID_TIER_PRICES_CENTS[tier];

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

  const rawMembership = (userRow as { membership?: string | null; membership_tier?: string | null }).membership ?? "";
  const currentTier = normalizeUserMembershipTier(rawMembership);
  const paymentSource = (userRow as { membership_payment_source?: string | null }).membership_payment_source ?? null;
  const prevExpStr = (userRow as { membership_expires_at?: string | null }).membership_expires_at ?? null;

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

  const ensured = await ensureWalletBalancesRow(userId);
  if (!ensured.ok) {
    return NextResponse.json({ error: ensured.message }, { status: 500 });
  }

  const {
    totalBalance,
    eligibleBalance,
    heldBalance,
    heldUntil,
  } = await getEligibleUpgradeBalance(userId);

  if (eligibleBalance < tierPrice) {
    const shortfall = tierPrice - eligibleBalance;
    let message = "Insufficient eligible balance";

    if (heldBalance > 0 && heldUntil) {
      const daysUntilClear = Math.max(
        0,
        Math.ceil((heldUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      );
      message = `$${(heldBalance / 100).toFixed(2)} of your balance is on a ${daysUntilClear}-day hold for security. Your eligible balance is $${(eligibleBalance / 100).toFixed(2)}.`;
    }

    return NextResponse.json(
      {
        error: message,
        totalBalance,
        eligibleBalance,
        heldBalance,
        heldUntil: heldUntil ? heldUntil.toISOString() : null,
        shortfall,
      },
      { status: 400 }
    );
  }

  const ref = renew
    ? `membership_renew_${tier}_${Date.now()}`
    : `membership_upgrade_${tier}_${Date.now()}`;
  const ledger = await walletLedgerEntry(userId, "subscription_payment", -tierPrice, ref);
  if (!ledger.success) {
    return NextResponse.json({ error: ledger.message }, { status: 400 });
  }

  const nowMs = Date.now();
  let expiresIso: string;
  if (renew && prevExpStr) {
    const prevMs = new Date(prevExpStr).getTime();
    const base = Number.isFinite(prevMs) ? Math.max(nowMs, prevMs) : nowMs;
    expiresIso = new Date(base + RENEWAL_MS).toISOString();
  } else if (renew) {
    expiresIso = new Date(nowMs + RENEWAL_MS).toISOString();
  } else {
    expiresIso = new Date(nowMs + RENEWAL_MS).toISOString();
  }
  const now = new Date().toISOString();

  const { error: updErr } = await admin
    .from("users")
    .update({
      membership: tier,
      membership_tier: tier,
      membership_expires_at: expiresIso,
      membership_payment_source: "balance",
      stripe_subscription_id: null,
      subscription_status: "active",
      updated_at: now,
    })
    .eq("id", userId);

  if (updErr) {
    await walletLedgerEntry(userId, "admin_adjustment", tierPrice, `rollback_${ref}`);
    return NextResponse.json({ error: "Failed to update membership" }, { status: 500 });
  }

  await admin
    .from("transactions")
    .insert({
      user_id: userId,
      type: "subscription_payment",
      amount: tierPrice,
      status: "completed",
      description: renew ? `Membership renewal (${tier})` : `Membership upgrade to ${tier}`,
      reference_id: ref,
    })
    .then(({ error }) => {
      if (error) console.error("[upgrade-with-balance] transactions insert:", error.message);
    });

  let gpcBonus = 0;
  if (renew) {
    const mo = await creditMonthlyBonus(admin, userId, tier, ref);
    if (mo.success) gpcBonus = mo.gpcCredited ?? 0;
  } else {
    const prev = currentTier;
    const totals = await applyMembershipUpgradeAndFirstMonthly(admin, userId, prev, tier, ref);
    gpcBonus = totals.upgradeGpc + totals.monthlyGpc;
  }

  const newBalance = await getCanonicalBalanceCents(userId);

  return NextResponse.json({
    success: true,
    newTier: tier as MarketingPlanId,
    amountCharged: tierPrice,
    expiresAt: expiresIso,
    newBalance,
    gpcBonus: renew ? 0 : gpcBonus,
  });
}
