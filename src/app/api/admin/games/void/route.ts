import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { voidSession } from "@/lib/escape-room-db";
import { getAdminUserIdFromRequest } from "@/lib/escape-room-api-auth";

/** POST /api/admin/games/void — body { sessionId, reason? } */
export async function POST(request: Request) {
  if (!(await isGameAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  let body: { sessionId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ message: "sessionId is required" }, { status: 400 });
  }
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "voided_by_admin";

  try {
    const adminId = await getAdminUserIdFromRequest(request);
    if (!adminId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const session = await voidSession(sessionId, adminId, reason);
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to void session";
    return NextResponse.json({ message }, { status: 400 });
  }
}
