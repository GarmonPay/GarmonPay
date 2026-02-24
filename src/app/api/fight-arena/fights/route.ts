import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createFight, listFights } from "@/lib/fight-arena-db";

/** GET /api/fight-arena/fights — list fights (query: status=open|active|completed) */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as "open" | "active" | "completed" | "cancelled" | undefined;
    const fights = await listFights(status);
    return NextResponse.json({ fights });
  } catch (e) {
    console.error("Fight arena list error:", e);
    return NextResponse.json({ fights: [] });
  }
}

/** POST /api/fight-arena/fights — create fight (body: { entryFeeCents }) */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  let body: { entryFeeCents?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const entryFeeCents = Number(body.entryFeeCents);
  if (!Number.isFinite(entryFeeCents)) {
    return NextResponse.json({ message: "entryFeeCents required" }, { status: 400 });
  }
  try {
    const result = await createFight(userId, entryFeeCents);
    if (!result.success) {
      return NextResponse.json({ message: result.message }, { status: 400 });
    }
    return NextResponse.json({ fight: result.fight });
  } catch (e) {
    console.error("Fight arena create error:", e);
    return NextResponse.json({ message: "Failed to create fight" }, { status: 500 });
  }
}
