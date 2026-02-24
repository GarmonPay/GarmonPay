import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getFight } from "@/lib/fight-arena-db";

/** GET /api/fight-arena/fights/[id] — get single fight */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await getAuthUserId(_request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const fight = await getFight(params.id);
    if (!fight) return NextResponse.json({ message: "Fight not found" }, { status: 404 });
    return NextResponse.json({ fight });
  } catch (e) {
    console.error("Fight arena get error:", e);
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
}
