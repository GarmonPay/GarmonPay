import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

type RpcPayload = {
  success?: boolean;
  message?: string;
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

  let body: { roomId?: unknown; reference?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!roomId) {
    return NextResponse.json({ message: "roomId required" }, { status: 400 });
  }

  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!reference) {
    return NextResponse.json({ message: "reference required" }, { status: 400 });
  }

  const { data, error } = await admin.rpc("garmondrop_forfeit_atomic", {
    p_room_id: roomId,
    p_user_id: userId,
    p_reference: reference,
  });

  if (error) {
    console.error("[garmondrop/forfeit] rpc error", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const payload = data as RpcPayload;
  if (!payload?.success) {
    return NextResponse.json(
      { message: typeof payload?.message === "string" ? payload.message : "Forfeit failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    winnerId: payload.winner_id ?? null,
    idempotent: payload.idempotent === true,
    room: payload.room ?? null,
  });
}
