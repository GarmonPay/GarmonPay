import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { celoFirstRow } from "@/lib/celo-first-row";
import { RtcRole, RtcTokenBuilder } from "agora-token";
import { celoAgoraChannelName } from "@/lib/celo-agora";

const TOKEN_TTL_SEC = 3600;

/** Stable 32-bit uid for Agora (1 … 2^32-1). */
export function agoraUidFromUserId(userId: string): number {
  const hex = userId.replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return 1;
  return (Math.abs(n) % 4294967294) + 1;
}

/**
 * POST /api/agora/rtc-token
 * Body: { roomId: string } — must match a C-Lo room the user can access.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { roomId?: string };
  try {
    body = (await req.json()) as { roomId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roomId = String(body.roomId ?? "").trim();
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim();
  const certificate = process.env.AGORA_APP_CERTIFICATE?.trim();

  if (!appId) {
    return NextResponse.json({ error: "Agora app not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: roomRows } = await admin.from("celo_rooms").select("id, room_type, banker_id").eq("id", roomId).limit(1);
  const roomRow = celoFirstRow(roomRows) as { id: string; room_type?: string; banker_id?: string } | null;
  if (!roomRow) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const isPublic = roomRow.room_type === "public";
  const isBanker = String(roomRow.banker_id ?? "") === userId;

  const { data: membershipRows } = await admin
    .from("celo_room_players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .limit(1);

  const member = celoFirstRow(membershipRows);
  if (!isPublic && !isBanker && !member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const channelName = celoAgoraChannelName(roomId);
  const uid = agoraUidFromUserId(userId);
  const now = Math.floor(Date.now() / 1000);
  const expire = now + TOKEN_TTL_SEC;

  let token: string | null = null;
  if (certificate) {
    token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      certificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      expire,
      expire,
    );
  }

  return NextResponse.json({
    appId,
    channelName,
    uid,
    token,
    expiresAt: expire,
  });
}
