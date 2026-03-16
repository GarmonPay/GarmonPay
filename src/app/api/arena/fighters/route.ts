import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

const STYLES = ["Brawler", "Boxer", "Slugger", "Pressure Fighter", "Counterpuncher", "Swarmer"] as const;
const AVATARS = ["🥊", "👊", "💪", "🔥", "⚡", "🎯", "🦁", "🐺", "🦅", "🐲", "💀", "👑"];

/** POST /api/arena/fighters — create fighter (one per user). Body: { name, style, avatar }. */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  // Ensure user exists in public.users (arena_fighters.user_id FK). Sync if missing.
  const { data: userRow } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();
  if (!userRow) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId).then((r) => r.data);
    const email = authUser?.user?.email ?? "";
    const { error: insertUserErr } = await supabase.from("users").insert({
      id: userId,
      email: email || null,
      role: "user",
      balance: 0,
      created_at: new Date().toISOString(),
    });
    if (insertUserErr) {
      const dbError = `${insertUserErr.code ?? "PGRST"}: ${insertUserErr.message}${insertUserErr.details ? ` (${JSON.stringify(insertUserErr.details)})` : ""}`;
      console.error("[arena/fighters] Ensure user in public.users failed:", dbError);
      return NextResponse.json(
        { message: "Account sync failed. Please try again.", errorDetail: dbError },
        { status: 500 }
      );
    }
  }

  const { data: existing } = await supabase.from("arena_fighters").select("id").eq("user_id", userId).maybeSingle();
  if (existing) {
    return NextResponse.json({ message: "You already have a fighter" }, { status: 400 });
  }

  let body: { name?: string; style?: string; avatar?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 50) : "";
  const style = typeof body.style === "string" && STYLES.includes(body.style as (typeof STYLES)[number]) ? body.style : STYLES[0];
  const avatar = typeof body.avatar === "string" && AVATARS.includes(body.avatar) ? body.avatar : AVATARS[0];

  if (!name || name.length < 2) {
    return NextResponse.json({ message: "Fighter name required (2+ characters)" }, { status: 400 });
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
    })
    .select("id, name, style, avatar, wins, losses")
    .single();

  if (error) {
    const dbError = `${error.code ?? "PGRST"}: ${error.message}${error.details ? ` (${JSON.stringify(error.details)})` : ""}`;
    console.error("[arena/fighters] Create fighter DB error:", dbError);
    return NextResponse.json(
      { message: error.message, errorDetail: dbError },
      { status: 500 }
    );
  }
  return NextResponse.json({ fighter });
}
