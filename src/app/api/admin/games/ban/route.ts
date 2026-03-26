import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { setPlayerGameStatus } from "@/lib/escape-room-db";
import { getAdminUserIdFromRequest } from "@/lib/escape-room-api-auth";

/**
 * POST /api/admin/games/ban
 * Body: { playerId, status: "active"|"suspended"|"banned", reason? }
 */
export async function POST(req: Request) {
  if (!(await isGameAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: {
    playerId?: string;
    status?: "active" | "suspended" | "banned";
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
  const status = body.status;
  if (!playerId) {
    return NextResponse.json({ message: "playerId required" }, { status: 400 });
  }
  if (status !== "active" && status !== "suspended" && status !== "banned") {
    return NextResponse.json(
      { message: "status must be active, suspended, or banned" },
      { status: 400 }
    );
  }

  const adminId = await getAdminUserIdFromRequest(req);
  if (!adminId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await setPlayerGameStatus(playerId, status, body.reason?.trim() || null, adminId);
    return NextResponse.json({ ok: true, playerId, status });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update player status" },
      { status: 500 }
    );
  }
}
