import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/celo/room/[roomId]/chat — send table message (service insert; bypasses flaky client RLS).
 */
export async function POST(req: Request, { params }: { params: Promise<{ roomId: string }> }) {
  const userId = await getAuthUserIdBearerOrCookie(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { roomId } = await params;
  if (!roomId) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  let body: { message?: string };
  try {
    body = (await req.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  if (!message || message.length > 2000) {
    return NextResponse.json({ error: "Message required (max 2000 chars)" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: roomRows } = await supabase.from("celo_rooms").select("id, room_type, banker_id").eq("id", roomId).limit(1);
  const roomRow = celoFirstRow(roomRows) as { id: string; room_type?: string; banker_id?: string } | null;
  if (!roomRow) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const isPublic = roomRow.room_type === "public";
  const isBanker = String(roomRow.banker_id ?? "") === userId;

  const { data: membershipRows } = await supabase
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .limit(1);

  const membership = celoFirstRow(membershipRows);
  if (!isPublic && !isBanker && !membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("celo_chat")
    .insert({
      room_id: roomId,
      user_id: userId,
      message,
    })
    .select("id, user_id, message, created_at")
    .single();

  if (insErr || !inserted) {
    console.error("[celo/chat] insert", insErr?.message);
    return NextResponse.json({ error: insErr?.message ?? "Failed to send" }, { status: 500 });
  }

  const { data: userRow } = await supabase.from("users").select("full_name, email").eq("id", userId).maybeSingle();
  const ur = userRow as { full_name?: string | null; email?: string | null } | null;

  return NextResponse.json({
    message: {
      id: String(inserted.id),
      user_id: String(inserted.user_id),
      message: String(inserted.message),
      is_system: false,
      created_at: String(inserted.created_at),
      user_name: ur?.full_name?.trim() || ur?.email?.split("@")[0] || "Player",
    },
  });
}
