import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { getEscapeSettings, netPoolCents, sumStakePoolForWindow, utcDateWindow } from "@/lib/escape-room-db";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const day = utcDateWindow();
  const settings = await getEscapeSettings();
  const feePct = settings ? Number(settings.platform_fee_percent) : 15;
  const gross = await sumStakePoolForWindow(day);
  const feeCents = Math.max(0, gross - netPoolCents(gross, feePct));

  const since15 = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const [{ count: activeCount }, { count: recentActive }, { data: todaySessions }, { data: winsToday }, { data: allSessions }] =
    await Promise.all([
      supabase.from("escape_room_sessions").select("*", { count: "exact", head: true }).eq("result", "active"),
      supabase
        .from("escape_room_sessions")
        .select("*", { count: "exact", head: true })
        .eq("result", "active")
        .gte("started_at", since15),
      supabase.from("escape_room_sessions").select("id").eq("prize_pool_window", day),
      supabase.from("escape_room_sessions").select("id").eq("prize_pool_window", day).eq("result", "win"),
      supabase.from("escape_room_sessions").select("result, escape_time_seconds, player_id"),
    ]);

  const totalToday = todaySessions?.length ?? 0;
  const winsCount = winsToday?.length ?? 0;
  const all = (allSessions ?? []) as { result: string; escape_time_seconds: number | null; player_id: string }[];
  const totalGames = all.length;
  const winAll = all.filter((r) => r.result === "win").length;
  const withTime = all.filter((r) => r.result === "win" && r.escape_time_seconds != null);
  const avgEscape =
    withTime.length > 0
      ? Math.round(
          withTime.reduce((s, r) => s + Number(r.escape_time_seconds), 0) / withTime.length
        )
      : 0;
  const uniquePlayers = new Set(all.map((r) => r.player_id)).size;
  const successPct = totalGames > 0 ? Math.round((winAll / totalGames) * 1000) / 10 : 0;

  const { data: paidToday } = await supabase
    .from("escape_room_sessions")
    .select("payout_cents")
    .eq("prize_pool_window", day)
    .eq("payout_status", "paid");

  const payoutsToday = (paidToday ?? []).reduce((s, r) => s + Number((r as { payout_cents: number }).payout_cents), 0);

  const { data: activeList } = await supabase
    .from("escape_room_sessions")
    .select("id, player_id, stake_cents, started_at, mode")
    .eq("result", "active")
    .order("started_at", { ascending: false })
    .limit(25);

  const actRows = (activeList ?? []) as {
    id: string;
    player_id: string;
    stake_cents: number;
    started_at: string;
    mode: string;
  }[];
  const actIds = Array.from(new Set(actRows.map((r) => r.player_id)));
  const emailMap = new Map<string, string>();
  if (actIds.length) {
    const { data: users } = await supabase.from("users").select("id, email").in("id", actIds);
    for (const u of (users ?? []) as { id: string; email: string }[]) emailMap.set(u.id, u.email);
  }
  const activeSessions = actRows.map((row) => ({
    ...row,
    email: emailMap.get(row.player_id) ?? null,
  }));

  let revenueSeries: { label: string; cents: number }[] = [];
  const range = new URL(request.url).searchParams.get("chart") ?? "daily";
  if (range === "daily") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const lbl = d.toISOString().slice(0, 10);
      const g = await sumStakePoolForWindow(lbl);
      const fee = Math.max(0, g - netPoolCents(g, feePct));
      revenueSeries.push({ label: lbl, cents: fee });
    }
  }

  return NextResponse.json({
    live_active_sessions: activeCount ?? 0,
    online_last_15m: recentActive ?? 0,
    today_window: day,
    pool_gross_cents_today: gross,
    platform_fee_cents_today: feeCents,
    payouts_paid_cents_today: payoutsToday,
    games_today: totalToday,
    wins_today: winsCount,
    total_games_all_time: totalGames,
    unique_players_all_time: uniquePlayers,
    avg_escape_seconds_winners: avgEscape,
    escape_success_rate_pct: successPct,
    active_sessions: activeSessions,
    revenue_chart: revenueSeries,
    settings_snapshot: settings
      ? {
          free_play: settings.free_play_enabled,
          stake_mode: settings.stake_mode_enabled,
          countdown_seconds: settings.countdown_seconds,
        }
      : null,
  });
}
