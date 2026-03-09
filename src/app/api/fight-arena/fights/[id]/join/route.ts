import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { joinFight } from "@/lib/fight-arena-db";

/** POST /api/fight-arena/fights/[id]/join — join an open fight (body: { fighterId? }) */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  let body: { fighterId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional body
  }
  try {
    const result = await joinFight(params.id, userId, body.fighterId);
    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({ fight: result.fight });
  } catch (e) {
    console.error("Fight arena join error:", e);
    return NextResponse.json({ message: "Failed to join fight" }, { status: 500 });
  }
}
