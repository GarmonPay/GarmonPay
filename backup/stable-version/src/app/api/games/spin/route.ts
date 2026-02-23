import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { performSpinWheel } from "@/lib/games-rewards-db";

/** POST /api/games/spin — one spin. Server-side only, budget protected. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const result = await performSpinWheel(userId);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Spin failed", amountCents: 0 }, { status: 400 });
  }
  return NextResponse.json({ success: true, amountCents: result.amountCents });
}
