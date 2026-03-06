import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { walletLedgerEntry, type WalletLedgerType } from "@/lib/wallet-ledger";
import { createAdminClient } from "@/lib/supabase";

const ALLOWED_TYPES: WalletLedgerType[] = [
  "game_play",
  "game_win",
  "referral_bonus",
  "subscription_payment",
  "commission_payout",
  "admin_adjustment",
];

/**
 * POST /api/wallet/transaction
 * Internal ledger entry (game, referral, commission, admin). Auth required for user-scoped;
 * admin_adjustment can be restricted to admin-only in production.
 * Fraud: duplicate reference blocked by DB; negative balance blocked by RPC.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { type?: string; amountCents?: number; reference?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const type = body.type as WalletLedgerType | undefined;
  if (!type || !ALLOWED_TYPES.includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : 0;
  if (!Number.isFinite(amountCents) || amountCents === 0) {
    return NextResponse.json({ error: "amountCents required and must be non-zero" }, { status: 400 });
  }

  const reference = typeof body.reference === "string" ? body.reference.trim() || undefined : undefined;

  const result = await walletLedgerEntry(userId, type, amountCents, reference ?? undefined);

  if (!result.success) {
    return NextResponse.json(
      { error: result.message ?? "Transaction failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    balance_cents: result.balance_cents,
    ledger_id: result.ledger_id,
  });
}
