import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getSeasonPassActive } from "@/lib/arena-season-pass";
import { arenaRateLimitSpin } from "@/lib/arena-security";

const SPIN_PRIZES = [10, 15, 20, 25, 30, 50, 75, 100]; // coins
const DAILY_FREE_SPINS = 1;
const SEASON_PASS_EXTRA = 1;

/** GET /api/arena/spin — spins left today. */
export async function GET(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  const { data: row } = await supabase
    .from("arena_daily_spin")
    .select("spins_used")
    .eq("user_id", userId)
    .eq("spin_date", today)
    .maybeSingle();

  const spinsUsed = (row as { spins_used?: number } | null)?.spins_used ?? 0;
  const seasonPassActive = await getSeasonPassActive(userId);
  const maxSpins = DAILY_FREE_SPINS + (seasonPassActive ? SEASON_PASS_EXTRA : 0);
  const spinsLeft = Math.max(0, maxSpins - spinsUsed);

  return NextResponse.json({
    spinsLeft,
    spinsUsed,
    maxSpins,
    hasSeasonPassExtra: seasonPassActive,
  });
}

/** POST /api/arena/spin — use one spin, return reward (coins). Rate limited. */
export async function POST(req: Request) {
  const rate = arenaRateLimitSpin(req);
  if (rate) return rate;
  const userId = await getAuthUserIdStrict(req);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  const seasonPassActive = await getSeasonPassActive(userId);
  const maxSpins = DAILY_FREE_SPINS + (seasonPassActive ? SEASON_PASS_EXTRA : 0);

  const { data: row } = await supabase
    .from("arena_daily_spin")
    .select("id, spins_used")
    .eq("user_id", userId)
    .eq("spin_date", today)
    .maybeSingle();

  const spinsUsed = (row as { spins_used?: number } | null)?.spins_used ?? 0;
  if (spinsUsed >= maxSpins) {
    return NextResponse.json({ message: "No spins left today", spinsLeft: 0 }, { status: 400 });
  }

  const prize = SPIN_PRIZES[Math.floor(Math.random() * SPIN_PRIZES.length)] ?? 25;
  const { data: u } = await supabase.from("users").select("arena_coins").eq("id", userId).single();
  const currentCoins = Number((u as { arena_coins?: number })?.arena_coins ?? 0);
  await supabase.from("users").update({ arena_coins: currentCoins + prize }).eq("id", userId);
  await supabase.from("arena_coin_transactions").insert({
    user_id: userId,
    amount: prize,
    type: "daily_spin",
    description: "Daily spin wheel",
  });

  if (row) {
    await supabase.from("arena_daily_spin").update({ spins_used: spinsUsed + 1, updated_at: new Date().toISOString() }).eq("id", (row as { id: string }).id);
  } else {
    await supabase.from("arena_daily_spin").insert({ user_id: userId, spin_date: today, spins_used: 1 });
  }

  return NextResponse.json({
    success: true,
    prizeCoins: prize,
    arenaCoins: currentCoins + prize,
    spinsLeft: maxSpins - spinsUsed - 1,
  });
}
