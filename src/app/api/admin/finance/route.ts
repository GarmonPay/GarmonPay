import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { sumWatchEarnGpcSince } from "@/lib/watch-earn";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function bucketPlatformSource(source: string): string {
  const s = (source || "").toLowerCase();
  if (s.includes("coin") && s.includes("flip")) return "coinflip";
  if (s.includes("member") || s === "stripe" || s.includes("subscription")) return "memberships";
  if (s.includes("ad")) return "ads";
  if (s.includes("celo") || s.includes("fight") || s.includes("arena")) return "games";
  return "other";
}

async function sumGpcByTypeSince(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  type: string,
  isoSince: string
): Promise<number> {
  const { data, error } = await supabase
    .from("coin_transactions")
    .select("gpay_coins")
    .eq("type", type)
    .gte("created_at", isoSince);
  if (error) throw error;
  return (data ?? []).reduce(
    (s, r) => s + Math.max(0, Math.floor(Number((r as { gpay_coins?: number }).gpay_coins ?? 0))),
    0
  );
}

async function sumPlatformEarningsSince(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  isoSince: string | null
): Promise<{ totalCents: number; breakdown: Record<string, number> }> {
  let query = supabase.from("platform_earnings").select("source, amount_cents, created_at");
  if (isoSince) query = query.gte("created_at", isoSince);
  const { data, error } = await query.limit(10000);
  if (error) throw error;

  const breakdown: Record<string, number> = {};
  let totalCents = 0;
  for (const row of data ?? []) {
    const n = Number((row as { amount_cents?: number }).amount_cents ?? 0);
    const bucket = bucketPlatformSource(String((row as { source?: string }).source ?? ""));
    totalCents += n;
    breakdown[bucket] = (breakdown[bucket] ?? 0) + n;
  }
  return { totalCents, breakdown };
}

/** GET /api/admin/finance — consolidated platform finance for admin UI */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const now = new Date();
  const todayStart = startOfUtcDay(now).toISOString();
  const monthStart = startOfUtcMonth(now).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const [
      peToday,
      peMonth,
      peAll,
      watch24h,
      watchMtd,
      watchAll,
      referralMtd,
      referralAll,
      throttleRes,
      gpayCirculationRes,
      goldPurchasedRes,
    ] = await Promise.all([
      sumPlatformEarningsSince(supabase, todayStart),
      sumPlatformEarningsSince(supabase, monthStart),
      sumPlatformEarningsSince(supabase, null),
      sumWatchEarnGpcSince(since24h),
      sumWatchEarnGpcSince(monthStart),
      sumWatchEarnGpcSince("1970-01-01T00:00:00.000Z"),
      sumGpcByTypeSince(supabase, "referral_commission", monthStart),
      sumGpcByTypeSince(supabase, "referral_commission", "1970-01-01T00:00:00.000Z"),
      supabase
        .from("throttle_log")
        .select(
          "id, created_at, observed_margin_pct, action_taken, prev_click_effective, new_click_effective, prev_view_effective, new_view_effective, notes"
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("gpay_balances").select("available_minor"),
      supabase
        .from("coin_transactions")
        .select("gold_coins")
        .eq("type", "gc_purchase")
        .gte("created_at", monthStart),
    ]);

    const gpcInCirculation = (gpayCirculationRes.data ?? []).reduce(
      (s, r) => s + Math.max(0, Math.floor(Number((r as { available_minor?: number }).available_minor ?? 0))),
      0
    );

    const goldPurchasedMonth = (goldPurchasedRes.data ?? []).reduce(
      (s, r) => s + Math.max(0, Math.floor(Number((r as { gold_coins?: number }).gold_coins ?? 0))),
      0
    );

    return NextResponse.json({
      overview: {
        platformRevenueTodayCents: peToday.totalCents,
        platformRevenueMtdCents: peMonth.totalCents,
        platformRevenueAllTimeCents: peAll.totalCents,
        watchGpcPaid24h: watch24h,
        watchGpcPaidMtd: watchMtd,
        watchGpcPaidAllTime: watchAll,
        referralGpcPaidMtd: referralMtd,
        referralGpcPaidAllTime: referralAll,
        gpcInCirculationMinor: gpcInCirculation,
        goldPurchasedMonth,
        netMarginMtdCents: peMonth.totalCents,
      },
      revenue: {
        inflowsToday: peToday,
        inflowsMtd: peMonth,
        inflowsAllTime: peAll,
        gpcOutflows: {
          watchEarnMtd: watchMtd,
          watchEarnAllTime: watchAll,
          referralCommissionMtd: referralMtd,
          referralCommissionAllTime: referralAll,
        },
      },
      profit: {
        platformRevenueAllTimeCents: peAll.totalCents,
        watchGpcOutflowAllTime: watchAll,
        referralGpcOutflowAllTime: referralAll,
        note: "USD platform_earnings minus GPC outflows (watch + referral) — GPC is not USD; shown for operational visibility.",
      },
      throttleLog: throttleRes.error
        ? { rows: [], message: throttleRes.error.message }
        : { rows: throttleRes.data ?? [] },
    });
  } catch (e) {
    console.error("[admin/finance]", e);
    return NextResponse.json(
      { message: e instanceof Error ? e.message : "Failed to load finance data" },
      { status: 500 }
    );
  }
}
