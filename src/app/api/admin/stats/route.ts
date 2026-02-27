import { NextResponse } from "next/server";
import { findUserById, hasAdminAccess } from "@/lib/auth-store";
import { getPlatformTotals } from "@/lib/transactions-db";
import { listAllAds } from "@/lib/ads-db";
import { createAdminClient } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

type PublicUserRow = {
  id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
};

type AdClickRow = {
  id: string;
  ad_id: string;
  user_id: string;
  created_at: string;
};

type RevenueTransactionRow = {
  amount: number | string | null;
  type: string | null;
};

function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

export async function GET(request: Request) {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const user = findUserById(adminId);
  if (!user || !hasAdminAccess(user)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createPublicClient();
  if (!supabase) {
    return NextResponse.json(
      { message: "Supabase public client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY." },
      { status: 503 }
    );
  }

  // Required production queries for user count and user list.
  const [countRes, usersRes] = await Promise.all([
    supabase
      .from("public.users")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("public.users")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (countRes.error || usersRes.error) {
    return NextResponse.json(
      { message: "Failed to fetch users from Supabase", error: countRes.error?.message ?? usersRes.error?.message },
      { status: 500 }
    );
  }

  const users = (usersRes.data ?? []) as PublicUserRow[];
  const baseStats = {
    totalUsers: countRes.count ?? users.length,
    totalEarningsCents: 0,
    totalAds: 0,
    totalReferralEarningsCents: 0,
    totalDepositsCents: 0,
    recentRegistrations: users.slice(0, 10).map((u) => ({
      id: u.id,
      email: u.email ?? "Unknown email",
      role: u.role ?? "member",
      createdAt: u.created_at ?? new Date(0).toISOString(),
    })),
    recentAdClicks: [] as { id: string; userId: string; adId: string; clickedAt: string }[],
    platformTotalEarningsCents: 0,
    platformTotalWithdrawalsCents: 0,
    platformTotalAdCreditCents: 0,
  };

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(baseStats, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const [platformTotals, ads, clicksRes, revenueRes] = await Promise.all([
      getPlatformTotals(),
      listAllAds(),
      admin.from("ad_clicks").select("id, ad_id, user_id, created_at").order("created_at", { ascending: false }).limit(20),
      admin.from("revenue_transactions").select("amount, type"),
    ]);

    const recentAdClicks = ((clicksRes.data ?? []) as AdClickRow[]).map((c) => ({
      id: c.id,
      userId: c.user_id,
      adId: c.ad_id,
      clickedAt: c.created_at,
    }));

    let totalDepositsCents = 0;
    for (const row of (revenueRes.data ?? []) as RevenueTransactionRow[]) {
      if (row.type === "payment") {
        totalDepositsCents += Math.round(Number(row.amount ?? 0) * 100);
      }
    }

    return NextResponse.json(
      {
        ...baseStats,
        totalAds: ads.length,
        totalEarningsCents: platformTotals.totalEarningsCents,
        platformTotalEarningsCents: platformTotals.totalEarningsCents,
        platformTotalWithdrawalsCents: platformTotals.totalWithdrawalsCents,
        platformTotalAdCreditCents: platformTotals.totalAdCreditCents,
        totalDepositsCents,
        recentAdClicks,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Admin stats extra metrics fetch failed:", error);
    return NextResponse.json(baseStats, { headers: { "Cache-Control": "no-store" } });
  }
}
