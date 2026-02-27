import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listAllWithdrawals, listWithdrawalsByUser } from "@/lib/withdrawals-db";
import { authenticateAdminRequest } from "@/lib/admin-auth";

/**
 * GET /api/withdrawals/list
 * - Default: return current user's withdrawals.
 * - scope=all (admin only): return all withdrawals.
 */
export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const scope = new URL(request.url).searchParams.get("scope");
  try {
    if (scope === "all") {
      const auth = await authenticateAdminRequest(request);
      if (!auth.ok) {
        return NextResponse.json({ message: auth.message }, { status: auth.status });
      }
      const withdrawals = await listAllWithdrawals();
      return NextResponse.json({ withdrawals });
    }

    const withdrawals = await listWithdrawalsByUser(userId);
    return NextResponse.json({ withdrawals });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list withdrawals";
    return NextResponse.json({ message }, { status: 500 });
  }
}
