import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

/** POST /api/fighters/customize — update fighter customization (gender, skin_tone, gloves, shorts, shoes). */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    fighter_id?: string;
    gender?: string | null;
    skin_tone?: string | null;
    gloves?: string | null;
    shorts?: string | null;
    shoes?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fighterId = typeof body.fighter_id === "string" ? body.fighter_id.trim() : null;
  if (!fighterId) {
    return NextResponse.json({ error: "fighter_id required" }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};
  if (body.gender !== undefined) {
    updates.gender = body.gender === null || body.gender === "" ? null : String(body.gender);
    if (updates.gender && !["male", "female"].includes(updates.gender)) {
      return NextResponse.json({ error: "gender must be male or female" }, { status: 400 });
    }
  }
  if (body.skin_tone !== undefined) updates.skin_tone = body.skin_tone === null || body.skin_tone === "" ? null : String(body.skin_tone);
  if (body.gloves !== undefined) updates.gloves = body.gloves === null || body.gloves === "" ? null : String(body.gloves);
  if (body.shorts !== undefined) updates.shorts = body.shorts === null || body.shorts === "" ? null : String(body.shorts);
  if (body.shoes !== undefined) updates.shoes = body.shoes === null || body.shoes === "" ? null : String(body.shoes);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No customization fields provided" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: fighter, error } = await supabase
    .from("fighters")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fighterId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error || !fighter) {
    return NextResponse.json({ error: "Fighter not found or update failed" }, { status: error?.code === "PGRST116" ? 404 : 500 });
  }

  return NextResponse.json({ fighter });
}
