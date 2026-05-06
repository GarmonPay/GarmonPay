import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

type RpcPayload = {
  success?: boolean;
  message?: string;
  outcome?: string;
  winner_id?: string;
  idempotent?: boolean;
  room?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const userId = await getAuthUserIdBearerOrCookie(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: {
    roomId?: unknown;
    column?: unknown;
    expectedSeq?: unknown;
    expected_seq?: unknown;
    reference?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!roomId) {
    return NextResponse.json({ message: "roomId required" }, { status: 400 });
  }

  const colRaw = Number(body.column ?? NaN);
  const column = Math.floor(colRaw);
  if (!Number.isFinite(colRaw) || column < 0 || column > 6) {
    return NextResponse.json({ message: "column must be 0–6" }, { status: 400 });
  }

  const seqRaw = Number(body.expectedSeq ?? body.expected_seq ?? NaN);
  const expectedSeq = Math.floor(seqRaw);
  if (!Number.isFinite(seqRaw) || expectedSeq < 0) {
    return NextResponse.json({ message: "expectedSeq required" }, { status: 400 });
  }

  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!reference) {
    return NextResponse.json({ message: "reference required" }, { status: 400 });
  }

  const { data, error } = await admin.rpc("garmonfour_make_move_atomic", {
    p_room_id: roomId,
    p_user_id: userId,
    p_column: column,
    p_expected_seq: expectedSeq,
    p_reference: reference,
  });

  if (error) {
    console.error("[garmonfour/move] rpc error", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const payload = data as RpcPayload;
  if (!payload?.success) {
    return NextResponse.json(
      { message: typeof payload?.message === "string" ? payload.message : "Move failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    outcome: payload.outcome ?? "continue",
    winnerId: payload.winner_id ?? null,
    idempotent: payload.idempotent === true,
    room: payload.room ?? null,
  });
}
