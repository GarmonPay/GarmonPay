import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getSeasonPassActive } from "@/lib/arena-season-pass";

const COINS_BY_DAY = [25, 30, 40, 50, 75, 100, 150]; // Day 1–7 streak

/** GET /api/arena/daily-login — today's status (claimed?, day streak). */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: todayRow } = await supabase
    .from("arena_daily_login")
    .select("day_streak, coins_earned")
    .eq("user_id", userId)
    .eq("login_date", today)
    .maybeSingle();

  const claimed = !!todayRow;
  let dayStreak = (todayRow as { day_streak?: number } | null)?.day_streak ?? 0;
  if (!claimed) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const { data: lastRow } = await supabase
      .from("arena_daily_login")
      .select("login_date, day_streak")
      .eq("user_id", userId)
      .order("login_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastDate = (lastRow as { login_date?: string } | null)?.login_date;
    const lastStreak = (lastRow as { day_streak?: number } | null)?.day_streak ?? 0;
    dayStreak = lastDate === yesterdayStr ? Math.min(7, lastStreak + 1) : 1;
  }

  return NextResponse.json({
    claimed: !!claimed,
    dayStreak,
    coinsEarnedToday: (todayRow as { coins_earned?: number } | null)?.coins_earned ?? 0,
  });
}

/** POST /api/arena/daily-login — claim today's login bonus. */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("arena_daily_login")
    .select("id")
    .eq("user_id", userId)
    .eq("login_date", today)
    .maybeSingle();
  if (existing) return NextResponse.json({ message: "Already claimed today", claimed: true }, { status: 200 });

  const { data: lastRow } = await supabase
    .from("arena_daily_login")
    .select("login_date, day_streak")
    .eq("user_id", userId)
    .order("login_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const lastDate = (lastRow as { login_date?: string } | null)?.login_date;
  const lastStreak = (lastRow as { day_streak?: number } | null)?.day_streak ?? 0;
  const dayStreak = lastDate === yesterdayStr ? Math.min(7, lastStreak + 1) : 1;
  const dayIndex = Math.min(dayStreak - 1, COINS_BY_DAY.length - 1);
  let coins = COINS_BY_DAY[dayIndex] ?? 150;
  const seasonPassActive = await getSeasonPassActive(userId);
  if (seasonPassActive) coins *= 2;

  const { data: u } = await supabase.from("users").select("arena_coins").eq("id", userId).single();
  const currentCoins = Number((u as { arena_coins?: number })?.arena_coins ?? 0);
  await supabase.from("users").update({ arena_coins: currentCoins + coins }).eq("id", userId);
  await supabase.from("arena_coin_transactions").insert({
    user_id: userId,
    amount: coins,
    type: "daily_login",
    description: `Day ${dayStreak} login bonus`,
  });
  await supabase.from("arena_daily_login").insert({
    user_id: userId,
    login_date: today,
    day_streak: dayStreak,
    coins_earned: coins,
  });

  return NextResponse.json({
    claimed: true,
    dayStreak,
    coinsEarned: coins,
    arenaCoins: currentCoins + coins,
  });
}
