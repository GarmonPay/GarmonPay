import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/fighters — list current user's fighters. */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("fighters")
    .select("*")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ fighters: data ?? [] });
}

type CreateFighterBody = {
  name?: string;
  gender?: "male" | "female";
  skin_tone?: string;
  gloves_color?: string;
  shorts_color?: string;
  shoes_color?: string;
  is_active?: boolean;
};

function cleanCosmeticText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().toLowerCase().slice(0, 32);
  return cleaned || fallback;
}

/** POST /api/fighters — create a fighter with base stats + customization. */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: CreateFighterBody = {};
  try {
    body = await req.json();
  } catch {
    // optional body
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Fighter";
  const gender = body.gender === "female" ? "female" : "male";
  const isActive = body.is_active !== false;
  const skinTone = cleanCosmeticText(body.skin_tone, "medium");
  const glovesColor = cleanCosmeticText(body.gloves_color, "red");
  const shortsColor = cleanCosmeticText(body.shorts_color, "black");
  const shoesColor = cleanCosmeticText(body.shoes_color, "white");
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
  if (isActive) {
    await supabase
      .from("fighters")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_active", true);
  }
  const { data: fighter, error } = await supabase
    .from("fighters")
    .insert({
      user_id: userId,
      name,
      gender,
      skin_tone: skinTone,
      gloves_color: glovesColor,
      shorts_color: shortsColor,
      shoes_color: shoesColor,
      speed: 5,
      power: 5,
      defense: 5,
      stamina: 5,
      experience: 0,
      wins: 0,
      losses: 0,
      level: 1,
      owned_cosmetics: {},
      is_active: isActive,
    })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ fighter });
}
