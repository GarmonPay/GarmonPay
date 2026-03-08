import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getOrCreateBoxerProfile } from "@/lib/boxer-profile";

/** GET /api/boxing/profile — get or create current user's boxer profile. */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await getOrCreateBoxerProfile(userId);
  if (!profile) {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
  return NextResponse.json(profile);
}

/** POST /api/boxing/profile — update current user's boxer name and/or stats. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { name?: string; power?: number; speed?: number; stamina?: number; defense?: number; chin?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { createAdminClient } = await import("@/lib/supabase");
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const profile = await getOrCreateBoxerProfile(userId);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") updates.name = body.name.trim() || null;
  const stat = (v: unknown, min = 1, max = 100) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : undefined;
  if (stat(body.power) != null) updates.power = stat(body.power);
  if (stat(body.speed) != null) updates.speed = stat(body.speed);
  if (stat(body.stamina) != null) updates.stamina = stat(body.stamina);
  if (stat(body.defense) != null) updates.defense = stat(body.defense);
  if (stat(body.chin) != null) updates.chin = stat(body.chin);
  const { error } = await supabase.from("boxing_profiles").update(updates).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const updated = await getOrCreateBoxerProfile(userId);
  return NextResponse.json(updated ?? profile);
}
