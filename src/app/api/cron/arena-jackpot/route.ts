import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** Run Friday after midnight UTC: pay previous week jackpot to a random eligible user (arena_daily_login that week). */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || process.env.ARENA_JOIN_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Service unavailable" }, { status: 503 });

  const now = new Date();
  const day = now.getUTCDay();
  const diff = day >= 5 ? day - 5 : day + 2;
  const friday = new Date(now);
  friday.setUTCDate(now.getUTCDate() - diff);
  friday.setUTCHours(0, 0, 0, 0);
  const prevFriday = new Date(friday);
  prevFriday.setUTCDate(prevFriday.getUTCDate() - 7);
  const weekStart = prevFriday.toISOString().slice(0, 10);

  const { data: jackpot, error: jErr } = await supabase
    .from("arena_jackpot")
    .select("id, total_amount, paid_out")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (jErr || !jackpot || (jackpot as { paid_out?: boolean }).paid_out) {
    return NextResponse.json({ message: "No unpaid jackpot for that week", weekStart });
  }
  const amount = Number((jackpot as { total_amount?: number }).total_amount ?? 0);
  if (amount <= 0) {
    await supabase.from("arena_jackpot").update({ paid_out: true }).eq("id", (jackpot as { id: string }).id);
    return NextResponse.json({ message: "Jackpot was empty", weekStart });
  }

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(prevFriday);
    d.setUTCDate(d.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const { data: allLogins } = await supabase
    .from("arena_daily_login")
    .select("user_id")
    .in("login_date", dates);
  const userIds = Array.from(new Set((allLogins ?? []).map((r: { user_id: string }) => r.user_id)));
  if (userIds.length === 0) {
    return NextResponse.json({ message: "No eligible users for jackpot", weekStart });
  }
  const winnerId = userIds[Math.floor(Math.random() * userIds.length)]!;
  const coinsToGrant = Math.round(amount); // store as coins for simplicity; or use wallet
  const { data: u } = await supabase.from("users").select("arena_coins").eq("id", winnerId).single();
  const current = Number((u as { arena_coins?: number })?.arena_coins ?? 0);
  await supabase.from("users").update({ arena_coins: current + coinsToGrant }).eq("id", winnerId);
  await supabase.from("arena_coin_transactions").insert({
    user_id: winnerId,
    amount: coinsToGrant,
    type: "jackpot",
    description: `Weekly jackpot winner (week ${weekStart})`,
  });
  await supabase.from("arena_jackpot").update({ paid_out: true, winner_fighter_id: null }).eq("id", (jackpot as { id: string }).id);

  return NextResponse.json({
    weekStart,
    winnerUserId: winnerId,
    amount: coinsToGrant,
  });
}
