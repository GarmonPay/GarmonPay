import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

type FighterPatchBody = {
  name?: string;
  gender?: "male" | "female";
  skin_tone?: string;
  gloves_color?: string;
  shorts_color?: string;
  shoes_color?: string;
  is_active?: boolean;
  speed?: number;
  power?: number;
  defense?: number;
  stamina?: number;
  experience?: number;
  level?: number;
};

function boundedInt(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function cleanText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const out = v.trim().slice(0, 48);
  return out || undefined;
}

/** GET /api/fighters/[id] — get one fighter (must belong to current user). */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const fighterId = params.id?.trim();
  if (!fighterId) return NextResponse.json({ error: "fighter id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("fighters")
    .select("*")
    .eq("id", fighterId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Fighter not found" }, { status: 404 });
  return NextResponse.json({ fighter: data });
}

/** PATCH /api/fighters/[id] — update current user's fighter (stats + cosmetics). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const fighterId = params.id?.trim();
  if (!fighterId) return NextResponse.json({ error: "fighter id required" }, { status: 400 });

  let body: FighterPatchBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  const name = cleanText(body.name);
  if (name) updates.name = name;
  if (body.gender === "male" || body.gender === "female") updates.gender = body.gender;
  const skinTone = cleanText(body.skin_tone);
  if (skinTone) updates.skin_tone = skinTone.toLowerCase();
  const gloves = cleanText(body.gloves_color);
  if (gloves) updates.gloves_color = gloves.toLowerCase();
  const shorts = cleanText(body.shorts_color);
  if (shorts) updates.shorts_color = shorts.toLowerCase();
  const shoes = cleanText(body.shoes_color);
  if (shoes) updates.shoes_color = shoes.toLowerCase();

  const speed = boundedInt(body.speed, 1, 100);
  if (speed != null) updates.speed = speed;
  const power = boundedInt(body.power, 1, 100);
  if (power != null) updates.power = power;
  const defense = boundedInt(body.defense, 1, 100);
  if (defense != null) updates.defense = defense;
  const stamina = boundedInt(body.stamina, 1, 100);
  if (stamina != null) updates.stamina = stamina;
  const experience = boundedInt(body.experience, 0, 1_000_000);
  if (experience != null) updates.experience = experience;
  const level = boundedInt(body.level, 1, 1000);
  if (level != null) updates.level = level;

  if (body.is_active === true) {
    await supabase
      .from("fighters")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_active", true)
      .neq("id", fighterId);
    updates.is_active = true;
  } else if (body.is_active === false) {
    updates.is_active = false;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("fighters")
    .update(updates)
    .eq("id", fighterId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "Failed to update fighter" }, { status: 500 });
  return NextResponse.json({ fighter: data });
}
