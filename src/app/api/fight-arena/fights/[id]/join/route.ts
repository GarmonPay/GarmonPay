import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { joinFight } from "@/lib/fight-arena-db";

/** POST /api/fight-arena/fights/[id]/join — join an open fight */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getAuthUserId(_request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const result = await joinFight(params.id, userId);
    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({ fight: result.fight });
  } catch (e) {
    console.error("Fight arena join error:", e);
    return NextResponse.json({ message: "Failed to join fight" }, { status: 500 });
  }
}
