import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";
import { totalWageredMinor } from "@/lib/coin-flip";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * GET /api/admin/coin-flip/stats — Coin Flip GPay metrics (UTC day).
 */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Server misconfigured" }, { status: 503 });
  }

  const now = new Date();
  const todayStart = startOfUtcDay(now).toISOString();

  const { data: completed, error } = await supabase
    .from("coin_flip_games")
    .select("mode, bet_amount_minor, house_cut_minor")
    .eq("status", "completed")
    .gte("resolved_at", todayStart);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const rows = (completed ?? []) as Array<{ mode: string; bet_amount_minor: number; house_cut_minor: number }>;

  let totalFlipsToday = 0;
  let totalHouseCutTodayMinor = 0;
  let totalWageredTodayMinor = 0;

  for (const r of rows) {
    totalFlipsToday += 1;
    totalHouseCutTodayMinor += Math.trunc(Number(r.house_cut_minor ?? 0));
    const bet = Math.trunc(Number(r.bet_amount_minor ?? 0));
    const mode = r.mode === "vs_player" ? "vs_player" : "vs_house";
    totalWageredTodayMinor += totalWageredMinor(mode, bet);
  }

  return NextResponse.json({
    totalFlipsToday,
    totalHouseCutTodayMinor,
    totalWageredTodayMinor,
  });
}
