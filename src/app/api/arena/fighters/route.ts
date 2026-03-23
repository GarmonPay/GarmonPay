import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase";
import { startMeshy3DGeneration } from "@/lib/arena-meshy-3d";

const STYLES = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;
const AVATARS = ["🥊", "👊", "💪", "🔥", "⚡", "🎯", "🦁", "🐺", "🦅", "🐲", "💀", "👑"];
/** Allowed enum values (keep in sync with `bodyTypeOptions` / etc. in arena-fighter-types) */
const VALID_BODY_TYPES = ["lightweight", "middleweight", "heavyweight"] as const;
const VALID_SKIN_TONES = ["tone1", "tone2", "tone3", "tone4", "tone5", "tone6"] as const;
const VALID_FACE_STYLES = ["determined", "fierce", "calm", "angry", "scarred", "young", "veteran", "masked"] as const;
const VALID_HAIR_STYLES = ["bald", "short_fade", "dreads", "cornrows", "afro", "mohawk", "buzz_cut", "long_tied"] as const;

/** POST /api/arena/fighters — create fighter (one per user). Auth via cookies (Supabase SSR) or Bearer token fallback. */
export async function POST(request: Request) {
  try {
    // Primary: cookie-based auth via @supabase/ssr
    const cookieStore = await cookies();
    const supabaseSsr = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );
    let userId: string | null = null;
    const { data: { user: ssrUser } } = await supabaseSsr.auth.getUser();
    if (ssrUser) {
      userId = ssrUser.id;
    }

    // Fallback: Bearer token in Authorization header
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createServerClient: createTokenClient } = await import("@/lib/supabase");
        const tokenClient = createTokenClient(bearerToken);
        if (tokenClient) {
          const { data: { user: tokenUser } } = await tokenClient.auth.getUser();
          if (tokenUser) userId = tokenUser.id;
        }
      }
    }

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
      fighter_color: rawFighterColor,
    } = body;
    const name = typeof rawName === "string" ? rawName.trim().slice(0, 50) : "";
    const style =
      typeof rawStyle === "string" && STYLES.includes(rawStyle as (typeof STYLES)[number])
        ? rawStyle
        : STYLES[0];
    const avatar =
      typeof rawAvatar === "string" && AVATARS.includes(rawAvatar) ? rawAvatar : AVATARS[0];
    const body_type =
      typeof rawBodyType === "string" &&
      VALID_BODY_TYPES.includes(rawBodyType as (typeof VALID_BODY_TYPES)[number])
        ? rawBodyType
        : "middleweight";
    const skin_tone =
      typeof rawSkinTone === "string" &&
      VALID_SKIN_TONES.includes(rawSkinTone as (typeof VALID_SKIN_TONES)[number])
        ? rawSkinTone
        : "tone3";
    const face_style =
      typeof rawFaceStyle === "string" &&
      VALID_FACE_STYLES.includes(rawFaceStyle as (typeof VALID_FACE_STYLES)[number])
        ? rawFaceStyle
        : "determined";
    const hair_style =
      typeof rawHairStyle === "string" &&
      VALID_HAIR_STYLES.includes(rawHairStyle as (typeof VALID_HAIR_STYLES)[number])
        ? rawHairStyle
        : "short_fade";
    const fighterColorStr =
      typeof rawFighterColor === "string" && /^#[0-9A-Fa-f]{6}$/.test(rawFighterColor.trim())
        ? rawFighterColor.trim()
        : "#f0a500";

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
        fighter_color: fighterColorStr,
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

    // Trigger 3D generation in background (fire-and-forget)
    if (fighter?.id && process.env.MESHY_API_KEY) {
      startMeshy3DGeneration(fighter.id, userId).catch((err) =>
        console.error("[arena/fighters] 3D generation trigger failed:", err)
      );
    }

    return NextResponse.json({ success: true, fighter });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Fighter creation error";
    console.error("Fighter creation error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
