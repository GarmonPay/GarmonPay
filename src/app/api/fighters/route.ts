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
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ fighters: data ?? [] });
}

/** POST /api/fighters — create a fighter with default stats (speed 5, power 5, defense 5). */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    // optional body
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Fighter";
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
  const { data: fighter, error } = await supabase
    .from("fighters")
    .insert({
      user_id: userId,
      name,
      speed: 5,
      power: 5,
      defense: 5,
      stamina: 50,
      experience: 0,
      wins: 0,
      losses: 0,
      level: 1,
    })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ fighter });
}
