import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { isCeloRoomJoinableStatus } from "@/lib/celo-room-constants";
import { normalizeCeloRoomLookupCode } from "@/lib/celo-lookup-code";
import { matchPublicCeloRoomByUuidPrefix } from "@/lib/celo-public-room-match";
import { celoQaLog } from "@/lib/celo-qa-log";

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
    celoQaLog("room_lookup_error", { reason: "missing_code", httpStatus: 400 });
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const normalized = normalizeCeloRoomLookupCode(raw);
  if (normalized.length < 4) {
    celoQaLog("room_lookup_error", { reason: "code_too_short", httpStatus: 400, codeLen: normalized.length });
    return NextResponse.json({ error: "Code is too short" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    celoQaLog("room_lookup_error", { reason: "no_supabase", httpStatus: 503 });
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Private rooms: join_code match (stored trimmed; compare normalized)
  const { data: privateRoom, error: privErr } = await supabase
    .from("celo_rooms")
    .select("id,status,room_type,name,join_code")
    .eq("room_type", "private")
    .eq("join_code", normalized)
    .maybeSingle();

  if (privErr) {
    celoQaLog("room_lookup_private_query_error", { message: privErr.message });
  }

  if (privateRoom) {
    const st = String((privateRoom as { status?: string }).status ?? "");
    if (!isCeloRoomJoinableStatus(st)) {
      celoQaLog("room_lookup_not_joinable", {
        kind: "private",
        roomId: (privateRoom as { id: string }).id,
        status: st,
        httpStatus: 404,
      });
      return NextResponse.json({ error: "No active room with that code" }, { status: 404 });
    }
    celoQaLog("room_lookup_ok", { kind: "private", roomId: (privateRoom as { id: string }).id, status: st });
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
    celoQaLog("room_lookup_public_list_error", { message: listErr.message, httpStatus: 500 });
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  const match = matchPublicCeloRoomByUuidPrefix(
    (candidates ?? []) as { id: string; status?: string; room_type?: string }[],
    normalized
  );

  if (!match) {
    celoQaLog("room_lookup_miss", { kind: "public", candidateCount: (candidates ?? []).length, httpStatus: 404 });
    return NextResponse.json({ error: "No active room with that code" }, { status: 404 });
  }

  celoQaLog("room_lookup_ok", { kind: "public", roomId: match.id, status: match.status });
  return NextResponse.json({
    roomId: match.id,
    status: match.status,
    room_type: match.room_type,
  });
}
