import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { endFight, runFight } from "@/lib/fight-arena-db";

/** POST /api/fight-arena/fights/[id]/end — end fight and set winner (body: { winnerUserId, winnerFighterId? }) */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  let body: { winnerUserId?: string; winnerFighterId?: string; runByStats?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  if (body.runByStats === true) {
    try {
      const result = await runFight(params.id);
      if (!result.success) {
        return NextResponse.json({ message: result.message }, { status: 400 });
      }
      return NextResponse.json({ fight: result.fight });
    } catch (e) {
      console.error("Fight arena run error:", e);
      return NextResponse.json({ message: "Failed to run fight" }, { status: 500 });
    }
  }
  const winnerUserId = body.winnerUserId;
  if (!winnerUserId || typeof winnerUserId !== "string") {
    return NextResponse.json({ message: "winnerUserId required" }, { status: 400 });
  }
  try {
    const result = await endFight(params.id, winnerUserId, body.winnerFighterId);
    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({ fight: result.fight });
  } catch (e) {
    console.error("Fight arena end error:", e);
    return NextResponse.json({ message: "Failed to end fight" }, { status: 500 });
  }
}
