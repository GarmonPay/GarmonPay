import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { completeWatchSession } from "@/lib/watch-earn";

/** POST /api/earn/watch/complete — validate 30s session and credit GPC. Body: { sessionId } */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return NextResponse.json({ message: "sessionId required" }, { status: 400 });
  }

  const result = await completeWatchSession(userId, sessionId);
  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    gpcAwarded: result.gpcAwarded,
    alreadyCompleted: result.alreadyCompleted ?? false,
  });
}
