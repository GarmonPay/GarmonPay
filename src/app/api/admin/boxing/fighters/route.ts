import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/boxing/fighters — admin fighter monitor list. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ fighters: [] }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50) || 50));

  const { data: fighters, error } = await supabase
    .from("fighters")
    .select("id, user_id, name, gender, speed, power, defense, stamina, experience, wins, losses, level, is_active, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ fighters: [] });

  const userIds = Array.from(new Set((fighters ?? []).map((f: { user_id: string }) => f.user_id)));
  const { data: users } = await supabase.from("users").select("id, email, banned").in("id", userIds);
  const userMap = new Map<string, { email: string; banned: boolean }>();
  for (const row of users ?? []) {
    const typed = row as { id: string; email?: string; banned?: boolean };
    userMap.set(typed.id, { email: typed.email ?? "—", banned: typed.banned === true });
  }

  return NextResponse.json({
    fighters: (fighters ?? []).map((fighter: Record<string, unknown>) => ({
      ...fighter,
      email: userMap.get(String(fighter.user_id))?.email ?? "—",
      banned: userMap.get(String(fighter.user_id))?.banned ?? false,
    })),
  });
}

/** PATCH /api/admin/boxing/fighters — adjust fighter stats. */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ message: "Database unavailable" }, { status: 503 });

  let body: {
    fighterId?: string;
    speed?: number;
    power?: number;
    defense?: number;
    stamina?: number;
    experience?: number;
    level?: number;
    wins?: number;
    losses?: number;
    is_active?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  const fighterId = typeof body.fighterId === "string" ? body.fighterId.trim() : "";
  if (!fighterId) return NextResponse.json({ message: "fighterId required" }, { status: 400 });

  const clamp = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : undefined;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const speed = clamp(body.speed, 1, 100);
  if (speed != null) updates.speed = speed;
  const power = clamp(body.power, 1, 100);
  if (power != null) updates.power = power;
  const defense = clamp(body.defense, 1, 100);
  if (defense != null) updates.defense = defense;
  const stamina = clamp(body.stamina, 1, 100);
  if (stamina != null) updates.stamina = stamina;
  const experience = clamp(body.experience, 0, 1_000_000);
  if (experience != null) updates.experience = experience;
  const level = clamp(body.level, 1, 1000);
  if (level != null) updates.level = level;
  const wins = clamp(body.wins, 0, 1_000_000);
  if (wins != null) updates.wins = wins;
  const losses = clamp(body.losses, 0, 1_000_000);
  if (losses != null) updates.losses = losses;
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ message: "No updates provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("fighters")
    .update(updates)
    .eq("id", fighterId)
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ message: "Failed to update fighter" }, { status: 500 });

  return NextResponse.json({ fighter: data });
}
