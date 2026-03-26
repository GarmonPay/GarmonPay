import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { utcDateWindow } from "@/lib/escape-room-db";

export async function GET(request: Request) {
  const uid = await getAuthUserIdStrict(request);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const day = utcDateWindow();
  const { data, error } = await supabase
    .from("escape_room_sessions")
    .select("escape_time_seconds, player_id, mode")
    .eq("prize_pool_window", day)
    .eq("result", "win")
    .not("escape_time_seconds", "is", null)
    .order("escape_time_seconds", { ascending: true })
    .limit(80);

  if (error) {
    console.error("escape leaderboard", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = { escape_time_seconds: number; player_id: string; mode: string };
  const rows = (data ?? []) as Row[];
  const bestByPlayer = new Map<string, Row>();
  for (const r of rows) {
    const prev = bestByPlayer.get(r.player_id);
    if (!prev || r.escape_time_seconds < prev.escape_time_seconds) {
      bestByPlayer.set(r.player_id, r);
    }
  }
  const deduped = Array.from(bestByPlayer.values()).sort(
    (a, b) => a.escape_time_seconds - b.escape_time_seconds
  );
  const topSlice = deduped.slice(0, 10);
  const ids = Array.from(new Set(topSlice.map((r) => r.player_id)));
  const emailMap = new Map<string, string>();
  if (ids.length) {
    const { data: users } = await supabase.from("users").select("id, email").in("id", ids);
    for (const u of (users ?? []) as { id: string; email: string }[]) {
      emailMap.set(u.id, u.email);
    }
  }

  const top = topSlice.map((r, i) => ({
    rank: i + 1,
    escape_seconds: r.escape_time_seconds,
    mode: r.mode,
    display_name: maskEmail(emailMap.get(r.player_id) ?? r.player_id.slice(0, 6)),
  }));

  return NextResponse.json({ window: day, entries: top });
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return email;
  return `${email[0]}•••@${email.slice(at + 1)}`;
}
