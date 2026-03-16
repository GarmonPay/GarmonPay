import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/arena/overview — Arena full dashboard: earnings by source, fight/spectator/tournament/store/coin/jackpot/season pass stats, recent earnings, payout queue. */
export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  try {
    const { data: rows } = await supabase
      .from("arena_admin_earnings")
      .select("source_type, amount, source_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const byType: Record<string, number> = {};
    for (const r of rows ?? []) {
      const t = (r as { source_type: string }).source_type;
      const a = Number((r as { amount: number }).amount ?? 0);
      byType[t] = (byType[t] ?? 0) + a;
    }
    const fightCuts = byType["fight"] ?? 0;
    const spectatorCuts = byType["spectator"] ?? 0;
    const storeRevenue = byType["store"] ?? 0;
    const coinSales = byType["coin_purchase"] ?? 0;
    const seasonPass = byType["season_pass"] ?? 0;
    const withdrawalFees = byType["withdrawal_fee"] ?? 0;
    const tournamentCuts = byType["tournament"] ?? 0;
    const total = fightCuts + spectatorCuts + storeRevenue + coinSales + seasonPass + withdrawalFees + tournamentCuts;

    const [{ count: fightCount }, { count: spectatorBetCount }, { data: tournaments }, { data: jackpotRows }, { data: seasonPassRows }] = await Promise.all([
      supabase.from("arena_fights").select("id", { count: "exact", head: true }),
      supabase.from("arena_spectator_bets").select("id", { count: "exact", head: true }),
      supabase.from("arena_tournaments").select("id, name, status, prize_pool, tournament_type").order("created_at", { ascending: false }).limit(20),
      supabase.from("arena_jackpot").select("id, week_start, total_amount, paid_out").order("week_start", { ascending: false }).limit(5),
      supabase.from("arena_season_pass").select("id, user_id, status, current_period_end").eq("status", "active"),
    ]);

    let aiGenerations = { questionnaire: 0, auto: 0, total: 0, regenerationCount: 0, regenerationRevenueCoins: 0 };
    try {
      const [{ data: fightersForAi }, { data: regenTx }] = await Promise.all([
        supabase.from("arena_fighters").select("generation_method").not("generation_method", "is", null),
        supabase.from("arena_coin_transactions").select("id, amount").eq("type", "regeneration"),
      ]);
      const aiByMethod: Record<string, number> = {};
      for (const r of fightersForAi ?? []) {
        const m = (r as { generation_method?: string }).generation_method ?? "manual";
        aiByMethod[m] = (aiByMethod[m] ?? 0) + 1;
      }
      aiGenerations = {
        questionnaire: aiByMethod["questionnaire"] ?? 0,
        auto: aiByMethod["auto"] ?? 0,
        total: (fightersForAi ?? []).length,
        regenerationCount: regenTx?.length ?? 0,
        regenerationRevenueCoins: (regenTx ?? []).reduce((sum, t) => sum + Math.abs(Number((t as { amount?: number }).amount ?? 0)), 0),
      };
    } catch (_) {
      // Columns may not exist before migration 12
    }

    const recentEarnings = (rows ?? []).slice(0, 30).map((r: Record<string, unknown>) => ({
      source_type: r.source_type,
      amount: Number(r.amount ?? 0),
      source_id: r.source_id,
      created_at: r.created_at,
    }));

    const payoutQueue: { type: string; count?: number }[] = [];
    const { count: pendingWithdrawals } = await supabase.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (pendingWithdrawals != null) payoutQueue.push({ type: "Withdrawals", count: pendingWithdrawals });

    return NextResponse.json({
      aiGenerations,
      earnings: {
        fightCuts,
        spectatorCuts,
        storeRevenue,
        coinSales,
        seasonPass,
        withdrawalFees,
        tournamentCuts,
        total,
      },
      stats: {
        fightCount: fightCount ?? 0,
        spectatorBetCount: spectatorBetCount ?? 0,
        activeSeasonPassCount: (seasonPassRows ?? []).length,
      },
      tournaments: tournaments ?? [],
      jackpots: jackpotRows ?? [],
      recentEarnings,
      payoutQueue,
    });
  } catch (e) {
    console.error("Admin arena overview:", e);
    return NextResponse.json({ message: "Failed to load overview" }, { status: 500 });
  }
}
