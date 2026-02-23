import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { joinTournament } from "@/lib/tournament-db";

/** POST /api/tournaments/join — join a tournament (entry fee deducted from balance). */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  let body: { tournamentId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const tournamentId = body.tournamentId?.trim();
  if (!tournamentId) return NextResponse.json({ message: "tournamentId required" }, { status: 400 });
  const result = await joinTournament(userId, tournamentId);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Join failed" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
