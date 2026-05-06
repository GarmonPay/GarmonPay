import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { normalizeUserMembershipTier, membershipTierRank } from "@/lib/garmon-plan-config";
import { PAID_TIER_PRICES_GC, type PaidMembershipTierId } from "@/lib/membership-balance-prices";
import { purchaseMembershipWithBalance } from "@/lib/membership-purchase-balance";
import { createGarmonNotification } from "@/lib/garmon-notifications";

export const runtime = "nodejs";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * GET/POST /api/cron/membership-renewal
 * Daily: balance-paid memberships expiring within 3 days — renew or warn; expired — downgrade.
 * Vercel Cron invokes GET; manual runs may use POST.
 */
async function runMembershipRenewal(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = (request.headers.get("x-cron-secret") ?? (authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "")).trim();
  const expected = process.env.CRON_SECRET?.trim();
  if (expected && secret !== expected) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const horizonMs = now + THREE_DAYS_MS;

  const { data: rows, error } = await admin
    .from("users")
    .select("id, membership, membership_tier, membership_expires_at, membership_payment_source, gold_coins")
    .eq("membership_payment_source", "balance")
    .not("membership_expires_at", "is", null);

  if (error) {
    console.error("[membership-renewal]", error.message);
    return NextResponse.json({ message: "Query failed", error: error.message }, { status: 500 });
  }

  let renewed = 0;
  let warned = 0;
  let downgraded = 0;

  for (const r of rows ?? []) {
    const row = r as {
      id: string;
      membership?: string | null;
      membership_tier?: string | null;
      membership_expires_at?: string | null;
      membership_payment_source?: string | null;
      gold_coins?: number | null;
    };
    const uid = row.id;
    const tierNorm = normalizeUserMembershipTier(row.membership ?? row.membership_tier ?? "");
    if (tierNorm === "free" || membershipTierRank(tierNorm) <= 0) continue;

    const expStr = row.membership_expires_at;
    if (!expStr) continue;
    const expMs = new Date(expStr).getTime();
    if (!Number.isFinite(expMs)) continue;

    const paidTier = tierNorm as PaidMembershipTierId;
    const price = PAID_TIER_PRICES_GC[paidTier];

    if (expMs < now) {
      await admin
        .from("users")
        .update({
          membership: "free",
          membership_tier: "free",
          membership_expires_at: null,
          membership_payment_source: null,
          updated_at: nowIso,
        })
        .eq("id", uid);
      downgraded += 1;
      await createGarmonNotification(
        uid,
        "membership_expired",
        "Membership expired",
        "Your membership has expired. You are now on the Free plan."
      ).catch(() => {});
      continue;
    }

    if (expMs > horizonMs) continue;

    const bal = Math.max(0, Math.floor(Number(row.gold_coins ?? 0)));
    if (bal >= price) {
      const purchase = await purchaseMembershipWithBalance(admin, uid, paidTier, price, expStr);
      if (!purchase.success) {
        await createGarmonNotification(
          uid,
          "membership_renew_failed",
          "Could not renew membership",
          `We could not charge your Gold Coins for ${paidTier} renewal. Add more GC before your plan expires.`
        ).catch(() => {});
        warned += 1;
        continue;
      }
      renewed += 1;
      await createGarmonNotification(
        uid,
        "membership_renewed_balance",
        "Membership renewed",
        "Your membership renewed using Gold Coins."
      ).catch(() => {});
      continue;
    }

    const daysLeft = Math.max(0, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));
    const short = price - bal;
    warned += 1;
    await createGarmonNotification(
      uid,
      "membership_expiring_soon",
      `Your ${paidTier} membership expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
      `Add ${short} GC to renew with balance or update your payment method before expiry.`
    ).catch(() => {});
  }

  return NextResponse.json({
    success: true,
    renewed,
    warned,
    downgraded,
  });
}

export async function GET(request: Request) {
  return runMembershipRenewal(request);
}

export async function POST(request: Request) {
  return runMembershipRenewal(request);
}
