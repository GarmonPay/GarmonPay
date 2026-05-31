import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createServerClient } from "@/lib/supabase";

type RpcPayload = {
  success?: boolean;
  message?: string;
  idempotent?: boolean;
};

export async function POST(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const client = createServerClient(bearerToken ?? undefined);
  if (!client) {
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

  const { data, error } = await client.rpc("garmondrop_cancel_room", {
    p_room_id: roomId,
  });

  if (error) {
    console.error("[garmondrop/cancel] rpc error", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const payload = data as RpcPayload;
  if (!payload?.success) {
    return NextResponse.json(
      { message: typeof payload?.message === "string" ? payload.message : "Cancel failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, idempotent: payload.idempotent === true });
}
