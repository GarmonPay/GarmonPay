import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listWithdrawalsByUser } from "@/lib/withdrawals-db";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/withdrawals/list — list current user's withdrawals. Same as GET /api/withdrawals. */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ withdrawals: [] }, { status: 503 });
  }
  try {
    const withdrawals = await listWithdrawalsByUser(userId);
    return NextResponse.json({ withdrawals });
  } catch (e) {
    console.error("Withdrawals list error:", e);
    return NextResponse.json({ withdrawals: [] }, { status: 500 });
  }
}
