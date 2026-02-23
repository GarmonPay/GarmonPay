import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { joinTeam } from "@/lib/team-db";

/** POST /api/teams/join — join team by id (body: teamId). */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  let body: { teamId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const teamId = body.teamId?.trim();
  if (!teamId) return NextResponse.json({ message: "teamId required" }, { status: 400 });
  const result = await joinTeam(userId, teamId);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Failed" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
