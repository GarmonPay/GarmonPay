import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

const STYLES = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;
const AVATARS = ["🥊", "👊", "💪", "🔥", "⚡", "🎯", "🦁", "🐺", "🦅", "🐲", "💀", "👑"];
const BODY_TYPES = ["lightweight", "middleweight", "heavyweight"] as const;
const SKIN_TONES = ["tone1", "tone2", "tone3", "tone4", "tone5", "tone6"] as const;
const FACE_STYLES = ["determined", "fierce", "calm", "angry", "scarred", "young", "veteran", "masked"] as const;
const HAIR_STYLES = ["bald", "short_fade", "dreads", "cornrows", "afro", "mohawk", "buzz_cut", "long_tied"] as const;

/** POST /api/arena/fighters — create fighter (one per user). Auth via Bearer token (session in localStorage). */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserIdStrict(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabase = createAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const body = await request.json();
    const {
      name: rawName,
      style: rawStyle,
      avatar: rawAvatar,
      body_type: rawBodyType,
      skin_tone: rawSkinTone,
      face_style: rawFaceStyle,
      hair_style: rawHairStyle,
    } = body;
    const name = typeof rawName === "string" ? rawName.trim().slice(0, 50) : "";
    const style =
      typeof rawStyle === "string" && STYLES.includes(rawStyle as (typeof STYLES)[number])
        ? rawStyle
        : STYLES[0];
    const avatar =
      typeof rawAvatar === "string" && AVATARS.includes(rawAvatar) ? rawAvatar : AVATARS[0];
    const body_type =
      typeof rawBodyType === "string" && BODY_TYPES.includes(rawBodyType as (typeof BODY_TYPES)[number])
        ? rawBodyType
        : "middleweight";
    const skin_tone =
      typeof rawSkinTone === "string" && SKIN_TONES.includes(rawSkinTone as (typeof SKIN_TONES)[number])
        ? rawSkinTone
        : "tone3";
    const face_style =
      typeof rawFaceStyle === "string" && FACE_STYLES.includes(rawFaceStyle as (typeof FACE_STYLES)[number])
        ? rawFaceStyle
        : "determined";
    const hair_style =
      typeof rawHairStyle === "string" && HAIR_STYLES.includes(rawHairStyle as (typeof HAIR_STYLES)[number])
        ? rawHairStyle
        : "short_fade";

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "Fighter name required (2+ characters)" },
        { status: 400 }
      );
    }

    // Ensure user exists in public.users (arena_fighters FK).
    const { data: userRow } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();
    if (!userRow) {
      const authResponse = await supabase.auth.admin.getUserById(userId);
      const authUser = authResponse.data?.user ?? null;
      const email = authUser?.email ?? "";
      const { error: insertUserErr } = await supabase.from("users").insert({
        id: userId,
        email: email || null,
        role: "user",
        balance: 0,
        created_at: new Date().toISOString(),
      });
      if (insertUserErr) {
        console.error("[arena/fighters] Ensure user in public.users failed:", insertUserErr);
        return NextResponse.json(
          { error: "Account sync failed. Please try again." },
          { status: 500 }
        );
      }
    }

    // Check if fighter already exists for this user
    const { data: existing } = await supabase
      .from("arena_fighters")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Fighter already exists" }, { status: 400 });
    }

    const { data: fighter, error } = await supabase
      .from("arena_fighters")
      .insert({
        user_id: userId,
        name,
        style,
        avatar,
        body_type,
        skin_tone,
        face_style,
        hair_style,
        strength: 48,
        speed: 48,
        stamina: 48,
        defense: 48,
        chin: 48,
        special: 20,
        wins: 0,
        losses: 0,
        training_sessions: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, fighter });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Fighter creation error";
    console.error("Fighter creation error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
