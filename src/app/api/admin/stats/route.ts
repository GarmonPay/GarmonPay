import { NextResponse } from "next/server";
import { getPlatformTotals } from "@/lib/transactions-db";
import { listAllAds } from "@/lib/ads-db";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminAccess } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const access = await requireAdminAccess(request);
  if (!access.ok) {
    return access.response;
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Admin client not available" }, { status: 503 });
  }

  const { count: totalUsers, error: usersCountError } = await admin
    .from("users")
    .select("*", { count: "exact", head: true });
  if (usersCountError) {
    console.error(usersCountError);
  }

  const { data: deposits, error: depositsError } = await admin
    .from("deposits")
    .select("amount");
  if (depositsError) {
    console.error(depositsError);
  }
  const totalDeposits =
    (deposits ?? []).reduce((sum, d) => sum + Number((d as { amount?: number }).amount ?? 0), 0) || 0;
  const totalDepositsCents = Math.round(totalDeposits * 100);

  const { data: users, error: usersError } = await admin
    .from("users")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (usersError) {
    console.error(usersError);
  }

  const { data: adClicks, error: adClicksError } = await admin
    .from("ad_clicks")
    .select("id, ad_id, user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (adClicksError) {
    console.error(adClicksError);
  }

  let totalAds = 0;
  try {
    const ads = await listAllAds();
    totalAds = ads.length;
  } catch (error) {
    console.error(error);
  }

  let platformTotalEarningsCents = 0;
  let platformTotalWithdrawalsCents = 0;
  let platformTotalAdCreditCents = 0;
  try {
    const totals = await getPlatformTotals();
    platformTotalEarningsCents = totals.totalEarningsCents;
    platformTotalWithdrawalsCents = totals.totalWithdrawalsCents;
    platformTotalAdCreditCents = totals.totalAdCreditCents;
  } catch (error) {
    console.error(error);
  }

  return NextResponse.json({
    totalUsers: totalUsers ?? 0,
    totalEarningsCents: platformTotalEarningsCents,
    totalAds,
    totalReferralEarningsCents: 0,
    platformTotalEarningsCents,
    platformTotalWithdrawalsCents,
    platformTotalAdCreditCents,
    totalDepositsCents,
    recentRegistrations: (users ?? []).map((u) => {
      const row = u as { id: string; email?: string; role?: string; created_at?: string };
      return {
        id: row.id,
        email: row.email ?? "unknown",
        role: row.role ?? "user",
        createdAt: row.created_at ?? new Date().toISOString(),
      };
    }),
    recentAdClicks: (adClicks ?? []).map((c) => {
      const row = c as { id: string; ad_id: string; user_id: string; created_at: string };
      return {
        id: row.id,
        userId: row.user_id,
        adId: row.ad_id,
        clickedAt: row.created_at,
      };
    }),
  });
}
