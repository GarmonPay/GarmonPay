import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { CELO_LOBBY_STATUSES } from "@/lib/celo-room-constants";

export const dynamic = "force-dynamic";

/**
 * GET /api/celo/lobby
 * Public lobby list (service role). Use this instead of the browser Supabase client so
 * unauthenticated sessions and RLS cannot hide public rooms.
 */
export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("celo_rooms")
    .select("*")
    .eq("room_type", "public")
    .in("status", [...CELO_LOBBY_STATUSES])
    .order("last_activity", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[celo/lobby] query failed", error.message);
    return NextResponse.json({ error: error.message ?? "Failed to load lobby" }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  return NextResponse.json({ rooms: rows });
}
