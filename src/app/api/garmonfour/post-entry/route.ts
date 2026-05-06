import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { GARMONFOUR_MIN_ENTRY_GPC } from "@/lib/connect-four";

type RpcPayload = {
  success?: boolean;
  message?: string;
  room_id?: string;
  idempotent?: boolean;
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
    op?: unknown;
    roomId?: unknown;
    entryAmount?: unknown;
    entry_amount?: unknown;
    reference?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const opRaw = typeof body.op === "string" ? body.op.trim().toLowerCase() : "";
  if (opRaw !== "create" && opRaw !== "join") {
    return NextResponse.json({ message: "op must be create or join" }, { status: 400 });
  }

  const roomIdRaw = body.roomId;
  const roomId =
    typeof roomIdRaw === "string" && roomIdRaw.trim() !== "" ? roomIdRaw.trim() : null;

  const amtRaw = Number(body.entryAmount ?? body.entry_amount ?? NaN);
  const entryAmount = Math.floor(amtRaw);
  if (!Number.isFinite(amtRaw) || entryAmount < GARMONFOUR_MIN_ENTRY_GPC) {
    return NextResponse.json(
      { message: `entryAmount must be an integer GPC amount (min ${GARMONFOUR_MIN_ENTRY_GPC})` },
      { status: 400 }
    );
  }

  const reference = typeof body.reference === "string" ? body.reference.trim() : "";
  if (!reference) {
    return NextResponse.json({ message: "reference required (idempotency)" }, { status: 400 });
  }

  if (opRaw === "join" && !roomId) {
    return NextResponse.json({ message: "roomId required for join" }, { status: 400 });
  }

  const { data, error } = await admin.rpc("garmonfour_post_entry_atomic", {
    p_op: opRaw,
    p_room_id: opRaw === "create" ? null : roomId,
    p_user_id: userId,
    p_entry_amount: entryAmount,
    p_reference: reference,
  });

  if (error) {
    console.error("[garmonfour/post-entry] rpc error", error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const payload = data as RpcPayload;
  if (!payload?.success) {
    return NextResponse.json(
      { message: typeof payload?.message === "string" ? payload.message : "Entry failed" },
      { status: 400 }
    );
  }

  const rid = typeof payload.room_id === "string" ? payload.room_id : roomId;
  if (!rid) {
    return NextResponse.json({ message: "Missing room id" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    roomId: rid,
    idempotent: payload.idempotent === true,
  });
}
