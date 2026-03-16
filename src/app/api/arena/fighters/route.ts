import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

const STYLES = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;
const AVATARS = ["🥊", "👊", "💪", "🔥", "⚡", "🎯", "🦁", "🐺", "🦅", "🐲", "💀", "👑"];

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
    const { name: rawName, style: rawStyle, avatar: rawAvatar } = body;
    const name = typeof rawName === "string" ? rawName.trim().slice(0, 50) : "";
    const style =
      typeof rawStyle === "string" && STYLES.includes(rawStyle as (typeof STYLES)[number])
        ? rawStyle
        : STYLES[0];
    const avatar =
      typeof rawAvatar === "string" && AVATARS.includes(rawAvatar) ? rawAvatar : AVATARS[0];

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
