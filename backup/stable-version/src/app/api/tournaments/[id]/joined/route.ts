import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { isPlayerInTournament } from "@/lib/tournament-db";

/** GET /api/tournaments/[id]/joined — check if current user joined. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ joined: false });
  const { id } = await params;
  if (!id) return NextResponse.json({ joined: false });
  const joined = await isPlayerInTournament(userId, id);
  return NextResponse.json({ joined });
}
