import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { startWatchSession } from "@/lib/watch-earn";

/** POST /api/earn/watch/start — server-timed watch session. Body: { videoId } */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { videoId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
  if (!videoId) {
    return NextResponse.json({ message: "videoId required" }, { status: 400 });
  }

  const result = await startWatchSession(userId, videoId);
  if ("error" in result) {
    return NextResponse.json({ message: result.error }, { status: result.status });
  }

  return NextResponse.json({
    sessionId: result.sessionId,
    watchSecondsRequired: 30,
  });
}
