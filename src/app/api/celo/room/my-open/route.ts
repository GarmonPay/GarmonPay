import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { celoFirstRow } from "@/lib/celo-first-row";

/**
 * GET /api/celo/room/my-open — banker’s active C-Lo room (if any), for lobby “resume” UX.
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ roomId: null, room: null });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data: rows, error } = await admin
    .from("celo_rooms")
    .select("id, name, status, room_type, last_activity")
    .eq("banker_id", userId)
    .in("status", ["waiting", "active", "rolling"])
    .order("last_activity", { ascending: false })
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = celoFirstRow(rows) as { id: string; name?: string; status?: string; room_type?: string } | null;
  if (!row) {
    return NextResponse.json({ roomId: null, room: null });
  }

  return NextResponse.json({
    roomId: row.id,
    room: {
      id: row.id,
      name: row.name ?? "",
      status: row.status ?? "",
      room_type: row.room_type ?? "public",
    },
  });
}
