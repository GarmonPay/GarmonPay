import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getBoxingStats } from "@/lib/boxing-db";

export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const stats = await getBoxingStats(userId);
  return NextResponse.json(stats);
}
