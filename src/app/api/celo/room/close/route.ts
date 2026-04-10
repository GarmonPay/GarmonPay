import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { celoFirstRow } from "@/lib/celo-first-row";
import { createAdminClient } from "@/lib/supabase";
import { normalizeCeloRoomRow } from "@/lib/celo-room-schema";
import { systemCloseCeloRoomWithRefunds } from "@/lib/celo-room-system-close";
import { celoQaLog } from "@/lib/celo-qa-log";

/**
 * POST /api/celo/room/close — banker (or creator) closes room: refund player entries + bank, cancel room.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { room_id } = body as { room_id?: string };
  if (!room_id) {
    return NextResponse.json({ error: "room_id required" }, { status: 400 });
  }

  const { data: roomRows, error: roomErr } = await supabase
    .from("celo_rooms")
    .select("*")
    .eq("id", room_id)
    .limit(1);
  const room = celoFirstRow(roomRows);
  if (roomErr || !room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const raw = room as Record<string, unknown>;
  const normalized = normalizeCeloRoomRow(raw);
  if (!normalized) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const bankerId = String(raw.banker_id ?? normalized.banker_id ?? "");
  const creatorId = String(raw.creator_id ?? "");
  const isBanker = !!bankerId && bankerId === String(userId);
  const isCreator = !!creatorId && creatorId === String(userId);
  if (!isBanker && !isCreator) {
    return NextResponse.json({ error: "Only the banker or room creator can close this room" }, { status: 403 });
  }

  const status = String(normalized.status ?? "");
  if (status === "cancelled" || status === "completed") {
    return NextResponse.json({ error: "Room is already closed" }, { status: 400 });
  }

  const { data: activeRound } = await supabase
    .from("celo_rounds")
    .select("id")
    .eq("room_id", room_id)
    .neq("status", "completed")
    .maybeSingle();

  if (activeRound) {
    return NextResponse.json({ error: "Cannot close while a round is in progress" }, { status: 400 });
  }

  const bankCentsPreview = Math.max(
    0,
    Math.round(Number(raw.current_bank_sc ?? raw.current_bank_cents ?? normalized.current_bank_cents ?? 0))
  );

  const closed = await systemCloseCeloRoomWithRefunds(supabase, room_id, {
    reason: "banker_closed",
    auditUserId: userId,
  });

  if (!closed.ok) {
    return NextResponse.json({ error: closed.error ?? "Failed to close room" }, { status: 500 });
  }

  celoQaLog("room_close_refunds_ok", {
    roomId: room_id,
    bankRefundedCentsPreview: bankCentsPreview,
  });

  return NextResponse.json({
    success: true,
    message: "Room closed and refunds issued",
  });
}
