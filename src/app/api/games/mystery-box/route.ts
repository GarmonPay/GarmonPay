import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { performMysteryBox } from "@/lib/games-rewards-db";

/** POST /api/games/mystery-box — open box. Random reward or nothing. Server-side only, budget protected. */
export async function POST(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const result = await performMysteryBox(userId);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Open failed", amountSc: 0 }, { status: 400 });
  }
  return NextResponse.json({ success: true, amountSc: result.amountSc });
}
