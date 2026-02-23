import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getTeamForUser, getTeamMembers } from "@/lib/team-db";

/** GET /api/teams/[id]/members — list members (caller must be in the team). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id: teamId } = await params;
  if (!teamId) return NextResponse.json({ message: "Team id required" }, { status: 400 });
  const myTeam = await getTeamForUser(userId);
  if (!myTeam || myTeam.id !== teamId) {
    return NextResponse.json({ message: "Not a member of this team" }, { status: 403 });
  }
  try {
    const members = await getTeamMembers(teamId);
    return NextResponse.json({ members });
  } catch (e) {
    console.error("Team members error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}
