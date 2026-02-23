import { NextResponse } from "next/server";
import { findUserById, hasAdminAccess } from "@/lib/auth-store";
import {
  getCommissionConfig,
  setCommissionPercentage,
  getTotalRecurringCommissionsPaidCents,
  getActiveReferralSubscriptionsCountAdmin,
  type MembershipTier,
} from "@/lib/referral-commissions-db";
import { createAdminClient } from "@/lib/supabase";

function isAdmin(request: Request): boolean {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return false;
  const user = findUserById(adminId);
  return !!(user && hasAdminAccess(user));
}

/** GET /api/admin/referral-commissions — config + stats (total paid, active referral subs). */
export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  try {
    const [config, totalPaidCents, activeReferralSubs] = await Promise.all([
      getCommissionConfig(),
      getTotalRecurringCommissionsPaidCents(),
      getActiveReferralSubscriptionsCountAdmin(),
    ]);
    return NextResponse.json({
      config: config.map((c) => ({ tier: c.membership_tier, percentage: c.commission_percentage })),
      totalRecurringCommissionsPaidCents: totalPaidCents,
      activeReferralSubscriptions: activeReferralSubs,
    });
  } catch (e) {
    console.error("Admin referral commissions error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}

/** PATCH /api/admin/referral-commissions — set commission % per tier. */
export async function PATCH(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: { tier?: string; percentage?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const tier = body.tier as MembershipTier | undefined;
  const percentage = typeof body.percentage === "number" ? body.percentage : undefined;
  if (!tier || !["starter", "pro", "elite", "vip"].includes(tier) || percentage == null) {
    return NextResponse.json({ message: "tier and percentage required" }, { status: 400 });
  }
  if (percentage < 0 || percentage > 100) {
    return NextResponse.json({ message: "percentage must be 0–100" }, { status: 400 });
  }
  try {
    await setCommissionPercentage(tier, percentage);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Admin set commission error:", e);
    return NextResponse.json({ message: "Failed to update" }, { status: 500 });
  }
}
