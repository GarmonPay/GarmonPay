import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";

  const { data: sessions, error } = await supabase
    .from("escape_room_sessions")
    .select("player_id, stake_cents, payout_cents, result, started_at")
    .limit(5000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Agg = {
    player_id: string;
    games: number;
    staked: number;
    won: number;
    lost: number;
    last: string;
  };
  const map = new Map<string, Agg>();
  for (const row of sessions ?? []) {
    const r = row as {
      player_id: string;
      stake_cents: number;
      payout_cents: number;
      result: string;
      started_at: string;
    };
    let a = map.get(r.player_id);
    if (!a) {
      a = { player_id: r.player_id, games: 0, staked: 0, won: 0, lost: 0, last: r.started_at };
      map.set(r.player_id, a);
    }
    a.games += 1;
    a.staked += Number(r.stake_cents ?? 0);
    if (r.result === "win") a.won += Number(r.payout_cents ?? 0);
    if (r.result === "lose" || r.result === "timeout") a.lost += Number(r.stake_cents ?? 0);
    if (r.started_at > a.last) a.last = r.started_at;
  }

  const { data: statRows } = await supabase.from("escape_room_player_status").select("player_id, status");

  const statusMap = new Map(
    (statRows ?? []).map((x) => [(x as { player_id: string }).player_id, (x as { status: string }).status])
  );

  let list = Array.from(map.values()).map((a) => {
    const wins = (sessions ?? []).filter(
      (x) => (x as { player_id: string }).player_id === a.player_id && (x as { result: string }).result === "win"
    ).length;
    const completed = (sessions ?? []).filter(
      (x) =>
        (x as { player_id: string }).player_id === a.player_id &&
        ["win", "lose", "timeout"].includes((x as { result: string }).result)
    ).length;
    const winRate = completed > 0 ? Math.round((wins / completed) * 1000) / 10 : 0;
    return {
      ...a,
      win_rate_pct: winRate,
      status: statusMap.get(a.player_id) ?? "active",
    };
  });

  const ids = list.map((p) => p.player_id);
  const { data: users } = await supabase.from("users").select("id, email").in("id", ids.slice(0, 500));

  const emailMap = new Map((users ?? []).map((u) => [(u as { id: string }).id, (u as { email: string }).email]));

  list = list.map((p) => ({
    ...p,
    email: emailMap.get(p.player_id) ?? null,
  }));

  if (q) {
    list = list.filter((p) => {
      const email = (p as { email?: string | null }).email ?? "";
      return p.player_id.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });
  }

  list.sort((a, b) => (a.last < b.last ? 1 : -1));

  return NextResponse.json({ players: list.slice(0, 200) });
}
