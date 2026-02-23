import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getTeamForUser, createTeam } from "@/lib/team-db";

/** GET /api/teams — get current user's team (if any). */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const team = await getTeamForUser(userId);
    return NextResponse.json({ team: team ?? null });
  } catch (e) {
    console.error("Teams get error:", e);
    return NextResponse.json({ message: "Failed to load" }, { status: 500 });
  }
}

/** POST /api/teams — create team (name in body). */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ message: "name required" }, { status: 400 });
  const result = await createTeam(userId, name);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Failed" }, { status: 400 });
  }
  return NextResponse.json({ team: result.team });
}
