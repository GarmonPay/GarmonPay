import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getWalletHistory } from "@/lib/wallet-ledger";

/**
 * GET /api/wallet/history
 * Returns ledger entries for the authenticated user (newest first).
 * Query: limit (default 50), offset (default 0).
 */
export async function GET(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  const entries = await getWalletHistory(userId, limit, offset);

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type,
      amount: e.amount,
      balance_after: e.balance_after,
      reference: e.reference,
      created_at: e.created_at,
    })),
  });
}
