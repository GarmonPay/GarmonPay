import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { leaveTeam } from "@/lib/team-db";

/** POST /api/teams/leave — leave current team. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const result = await leaveTeam(userId);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Failed" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
