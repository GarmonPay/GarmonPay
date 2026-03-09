import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/leaderboard — top fighters by wins, level, earnings. Public. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const sort = searchParams.get("sort") ?? "wins"; // wins | level | earnings

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ leaderboard: [] });
  }

  let orderBy = "wins";
  let ascending = false;
  if (sort === "level") {
    orderBy = "level";
    ascending = false;
  } else if (sort === "earnings") {
    orderBy = "earnings";
    ascending = false;
  }

  const { data: fighters, error } = await supabase
    .from("fighters")
    .select("id, user_id, name, speed, power, defense, wins, losses, level, earnings")
    .order(orderBy, { ascending })
    .limit(limit);

  if (error) {
    return NextResponse.json({ leaderboard: [] });
  }

  const userIds = Array.from(new Set((fighters ?? []).map((f: { user_id: string }) => f.user_id)));
  const { data: users } = await supabase.from("users").select("id, email").in("id", userIds);
  const emailById = new Map<string, string>();
  for (const u of users ?? []) {
    const r = u as { id: string; email?: string };
    emailById.set(r.id, r.email ?? "—");
  }

  const leaderboard = (fighters ?? []).map((f: Record<string, unknown>, i: number) => ({
    rank: i + 1,
    fighter_id: f.id,
    user_id: f.user_id,
    email: emailById.get(f.user_id as string) ?? "—",
    name: f.name,
    speed: f.speed,
    power: f.power,
    defense: f.defense,
    wins: f.wins,
    losses: f.losses,
    level: f.level,
    earnings_cents: f.earnings,
  }));

  return NextResponse.json({ leaderboard });
}
