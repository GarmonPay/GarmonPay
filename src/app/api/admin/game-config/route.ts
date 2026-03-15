import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

const GAME_NAMES = ["spin_wheel", "scratch_card", "pinball", "mystery_box"] as const;

/** GET /api/admin/game-config — return game_config (house_edge_percent per game). */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("game_config")
    .select("game_name, house_edge_percent, updated_at")
    .in("game_name", GAME_NAMES);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as Array<{ game_name: string; house_edge_percent: number }>;
  const config = Object.fromEntries(
    GAME_NAMES.map((name) => {
      const row = rows.find((r) => r.game_name === name);
      return [name, Number(row?.house_edge_percent ?? 10)];
    })
  );
  return NextResponse.json({ config, rows });
}

/** PATCH /api/admin/game-config — update house_edge_percent for one game. Body: { game_name: string, house_edge_percent: number } */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }
  let body: { game_name?: string; house_edge_percent?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const gameName = body.game_name;
  const pct = body.house_edge_percent;
  if (!gameName || !GAME_NAMES.includes(gameName as (typeof GAME_NAMES)[number])) {
    return NextResponse.json({ message: "game_name must be one of: " + GAME_NAMES.join(", ") }, { status: 400 });
  }
  if (typeof pct !== "number" || pct < 0 || pct > 100) {
    return NextResponse.json({ message: "house_edge_percent must be 0–100" }, { status: 400 });
  }
  const { error } = await supabase
    .from("game_config")
    .update({ house_edge_percent: pct, updated_at: new Date().toISOString() })
    .eq("game_name", gameName);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, game_name: gameName, house_edge_percent: pct });
}
