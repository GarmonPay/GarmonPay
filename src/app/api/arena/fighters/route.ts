import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const STYLES = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;
const AVATARS = ["🥊", "👊", "💪", "🔥", "⚡", "🎯", "🦁", "🐺", "🦅", "🐲", "💀", "👑"];

/** POST /api/arena/fighters — create fighter (one per user). Auth via session cookies. */
export async function POST(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Ensure user exists in public.users (arena_fighters FK). Use admin client for sync.
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    const { data: userRow } = await admin.from("users").select("id").eq("id", user.id).maybeSingle();
    if (!userRow) {
      const authResponse = await admin.auth.admin.getUserById(user.id);
      const authUser = authResponse.data?.user ?? null;
      const email = authUser?.email ?? "";
      const { error: insertUserErr } = await admin.from("users").insert({
        id: user.id,
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
    const { data: existing } = await admin
      .from("arena_fighters")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Fighter already exists" }, { status: 400 });
    }

    const { data: fighter, error } = await admin
      .from("arena_fighters")
      .insert({
        user_id: user.id,
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
