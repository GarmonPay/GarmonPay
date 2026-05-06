import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

type RpcPayload = {
  success?: boolean;
  message?: string;
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

  let body: { roomId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  if (!roomId) {
    return NextResponse.json({ message: "roomId required" }, { status: 400 });
  }

  const { data, error } = await admin.rpc("garmonfour_repair_turn_atomic", {
    p_room_id: roomId,
    p_user_id: userId,
  });

  if (error) {
    console.error("[garmonfour/repair-turn] rpc error", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const payload = data as RpcPayload;
  if (!payload?.success) {
    return NextResponse.json(
      { message: typeof payload?.message === "string" ? payload.message : "Repair failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
