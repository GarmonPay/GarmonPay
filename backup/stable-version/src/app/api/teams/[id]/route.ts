import { NextResponse } from "next/server";
import { getTeam } from "@/lib/team-db";

/** GET /api/teams/[id] — get team by id (for invite page). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ message: "Team id required" }, { status: 400 });
  try {
    const team = await getTeam(id);
    if (!team) return NextResponse.json({ message: "Team not found" }, { status: 404 });
    return NextResponse.json({ team: { id: team.id, name: team.name } });
  } catch (e) {
    console.error("Team get error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}
