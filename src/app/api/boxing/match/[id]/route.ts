import { NextResponse } from "next/server";
import { getBoxingMatchById } from "@/lib/boxing-db";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const matchId = params.id;
  if (!matchId) return NextResponse.json({ message: "Match ID required" }, { status: 400 });
  const match = await getBoxingMatchById(matchId);
  if (!match) return NextResponse.json({ message: "Match not found" }, { status: 404 });
  return NextResponse.json({ match });
}
