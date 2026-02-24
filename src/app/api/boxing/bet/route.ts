import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { placeBet } from "@/lib/boxing-db";

export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: { matchId?: string; betOnPlayerId?: string; amountCents?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";
  const betOnPlayerId = typeof body.betOnPlayerId === "string" ? body.betOnPlayerId.trim() : "";
  const amountCents = typeof body.amountCents === "number" ? body.amountCents : 0;
  if (!matchId || !betOnPlayerId) {
    return NextResponse.json({ message: "matchId and betOnPlayerId required" }, { status: 400 });
  }
  const result = await placeBet(userId, matchId, betOnPlayerId, amountCents);
  if (!result.success) {
    return NextResponse.json({ message: result.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
