import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isCeloRoomJoinableStatus } from "@/lib/celo-room-constants";
import { normalizeCeloRoomLookupCode } from "@/lib/celo-lookup-code";

export const dynamic = "force-dynamic";

/**
 * GET /api/celo/room/lookup?code=XXXXXXXX
 * Resolve a room id from a lobby code (private join_code or first 8 hex chars of public room UUID).
 * Service role — works the same for every device and does not depend on RLS.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("code")?.trim() ?? "";
  if (!raw) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const normalized = normalizeCeloRoomLookupCode(raw);
  if (normalized.length < 4) {
    return NextResponse.json({ error: "Code is too short" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  console.error("[celo/room/lookup] code=", normalized);

  // Private rooms: join_code match (stored trimmed; compare normalized)
  const { data: privateRoom, error: privErr } = await supabase
    .from("celo_rooms")
    .select("id,status,room_type,name,join_code")
    .eq("room_type", "private")
    .eq("join_code", normalized)
    .maybeSingle();

  if (privErr) {
    console.error("[celo/room/lookup] private query", privErr.message);
  }

  if (privateRoom) {
    const st = String((privateRoom as { status?: string }).status ?? "");
    if (!isCeloRoomJoinableStatus(st)) {
      console.error("[celo/room/lookup] private room not joinable", { id: (privateRoom as { id: string }).id, st });
      return NextResponse.json({ error: "No active room with that code" }, { status: 404 });
    }
    console.error("[celo/room/lookup] matched private", (privateRoom as { id: string }).id);
    return NextResponse.json({
      roomId: (privateRoom as { id: string }).id,
      status: st,
      room_type: (privateRoom as { room_type?: string }).room_type ?? "private",
    });
  }

  // Public rooms: UUID prefix (first 8 hex chars, no dashes)
  const { data: candidates, error: listErr } = await supabase
    .from("celo_rooms")
    .select("id,status,room_type")
    .eq("room_type", "public")
    .order("last_activity", { ascending: false })
    .limit(400);

  if (listErr) {
    console.error("[celo/room/lookup] public list", listErr.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  const match = (candidates ?? []).find((r) => {
    const row = r as { id: string; status?: string };
    if (!isCeloRoomJoinableStatus(row.status)) return false;
    const idCompact = String(row.id)
      .replace(/-/g, "")
      .toUpperCase();
    return idCompact.startsWith(normalized);
  }) as { id: string; status?: string; room_type?: string } | undefined;

  if (!match) {
    console.error("[celo/room/lookup] no public match");
    return NextResponse.json({ error: "No active room with that code" }, { status: 404 });
  }

  console.error("[celo/room/lookup] matched public", match.id);
  return NextResponse.json({
    roomId: match.id,
    status: String(match.status ?? ""),
    room_type: match.room_type ?? "public",
  });
}
