import { NextResponse } from "next/server";
import { isGameAdmin } from "@/lib/admin-auth";
import { getSessionReplayMetadata } from "@/lib/escape-room-db";

/** GET /api/admin/games/replay?sessionId=... */
export async function GET(request: Request) {
  if (!(await isGameAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ message: "sessionId is required" }, { status: 400 });
  }
  try {
    const data = await getSessionReplayMetadata(sessionId);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load replay metadata";
    return NextResponse.json({ message }, { status: 500 });
  }
}
