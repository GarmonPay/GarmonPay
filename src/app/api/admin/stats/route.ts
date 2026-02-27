import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { authenticateAdminRequest } from "@/lib/admin-auth";

function sumAmounts(rows: Array<Record<string, unknown>>, key: string): number {
  return rows.reduce((total, row) => {
    const value = Number(row[key] ?? 0);
    return Number.isFinite(value) ? total + Math.round(value) : total;
  }, 0);
}

export async function GET(request: Request) {
  const auth = await authenticateAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ message: auth.message }, { status: auth.status });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const [
    totalUsersRes,
    recentUsersRes,
    depositsRes,
    withdrawalsRes,
    platformRevenueRes,
    adsRes,
    adClicksRes,
  ] = await Promise.all([
    admin.from("users").select("id", { count: "exact", head: true }),
    admin
      .from("users")
      .select("id, email, role, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    admin.from("deposits").select("amount_cents, status"),
    admin.from("withdrawals").select("amount, status"),
    admin.from("platform_revenue").select("amount"),
    admin.from("ads").select("id, profit_amount, status"),
    admin
      .from("ad_clicks")
      .select("id, ad_id, user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const allErrors = [
    totalUsersRes.error,
    recentUsersRes.error,
    depositsRes.error,
    withdrawalsRes.error,
    platformRevenueRes.error,
    adsRes.error,
    adClicksRes.error,
  ].filter(Boolean);

  if (allErrors.length > 0) {
    const message = allErrors[0]?.message ?? "Failed to load admin stats";
    return NextResponse.json({ message }, { status: 500 });
  }

  const depositRows = ((depositsRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => {
    const status = String(row.status ?? "succeeded");
    return status === "succeeded" || status === "pending";
  });
  const withdrawalRows = ((withdrawalsRes.data ?? []) as Array<Record<string, unknown>>).filter((row) => {
    const status = String(row.status ?? "");
    return status !== "rejected" && status !== "failed";
  });
  const revenueRows = (platformRevenueRes.data ?? []) as Array<Record<string, unknown>>;
  const adsRows = (adsRes.data ?? []) as Array<Record<string, unknown>>;

  const totalDepositsCents = sumAmounts(depositRows, "amount_cents");
  const totalWithdrawalsCents = sumAmounts(withdrawalRows, "amount");
  const platformRevenueCents = sumAmounts(revenueRows, "amount");
  const adsProfitCents = sumAmounts(adsRows, "profit_amount");
  const totalRevenueCents = totalDepositsCents + platformRevenueCents + adsProfitCents;
  const totalProfitCents = totalRevenueCents - totalWithdrawalsCents;

  return NextResponse.json({
    totalUsers: totalUsersRes.count ?? 0,
    totalDepositsCents,
    totalRevenueCents,
    totalProfitCents,
    totalWithdrawalsCents,
    totalAds: adsRows.length,
    totalEarningsCents: totalRevenueCents,
    totalReferralEarningsCents: 0,
    platformTotalEarningsCents: totalRevenueCents,
    platformTotalWithdrawalsCents: totalWithdrawalsCents,
    platformTotalAdCreditCents: 0,
    recentRegistrations: (recentUsersRes.data ?? []).map((u) => ({
      id: String((u as { id?: string }).id ?? ""),
      email: String((u as { email?: string }).email ?? ""),
      role: String((u as { role?: string }).role ?? "member"),
      createdAt: String((u as { created_at?: string }).created_at ?? new Date().toISOString()),
    })),
    recentAdClicks: (adClicksRes.data ?? []).map((c) => ({
      id: String((c as { id?: string }).id ?? ""),
      userId: String((c as { user_id?: string }).user_id ?? ""),
      adId: String((c as { ad_id?: string }).ad_id ?? ""),
      clickedAt: String((c as { created_at?: string }).created_at ?? new Date().toISOString()),
    })),
  });
}
