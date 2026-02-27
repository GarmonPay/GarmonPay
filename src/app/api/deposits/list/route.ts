import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listAllDeposits, listDepositsByUser } from "@/lib/deposits-db";
import { authenticateAdminRequest } from "@/lib/admin-auth";

/**
 * GET /api/deposits/list
 * - Default: return current user's deposits.
 * - scope=all (admin only): return all deposits.
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
      const deposits = await listAllDeposits();
      return NextResponse.json({ deposits });
    }

    const deposits = await listDepositsByUser(userId);
    return NextResponse.json({ deposits });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list deposits";
    return NextResponse.json({ message }, { status: 500 });
  }
}
