import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";
import { createClient } from "@supabase/supabase-js";

async function adminUserId(request: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  let token: string | null = null;
  try {
    token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? null;
  } catch {
    /* ignore */
  }
  if (!token) {
    const h = request.headers.get("authorization");
    token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  }
  if (!token) return null;
  const authClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  return user?.id ?? null;
}

export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const playerId = typeof body.player_id === "string" ? body.player_id : "";
  const status = body.status === "suspended" ? "suspended" : body.status === "banned" ? "banned" : "";
  const reason = typeof body.reason === "string" ? body.reason : null;
  const reviewer = await adminUserId(request);

  if (!playerId || !status) {
    return NextResponse.json({ error: "player_id and status required" }, { status: 400 });
  }

  const { error } = await supabase.from("escape_room_player_status").upsert(
    {
      player_id: playerId,
      status,
      reason,
      updated_by: reviewer,
      flagged_suspicious: true,
    },
    { onConflict: "player_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
