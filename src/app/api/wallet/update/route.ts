import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { walletLedgerEntry } from "@/lib/wallet-ledger";

/**
 * POST /api/wallet/update
 * Internal/admin: adjust wallet balance (credit or debit). Use admin_adjustment type.
 * Body: { amount_cents: number, reference?: string } or { user_id: string, amount_cents: number, reference?: string } for admin.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const amountCents = typeof body.amount_cents === "number" ? Math.round(body.amount_cents) : 0;
  const reference = typeof body.reference === "string" ? body.reference : undefined;
  const targetUserId = typeof body.user_id === "string" ? body.user_id : null;

  let userId: string | null;
  if (targetUserId) {
    const adminKey = req.headers.get("x-admin-key");
    const adminSecret = process.env.ADMIN_SECRET?.trim();
    if (!adminSecret || adminKey !== adminSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = targetUserId;
  } else {
    userId = await getAuthUserIdStrict(req);
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!Number.isFinite(amountCents) || amountCents === 0) {
    return NextResponse.json({ error: "Invalid amount_cents" }, { status: 400 });
  }

  const result = await walletLedgerEntry(userId, "admin_adjustment", amountCents, reference ?? undefined);
  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ balance_cents: result.balance_cents });
}
