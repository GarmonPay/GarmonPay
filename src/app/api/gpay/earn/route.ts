import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { gpayLedgerEntry } from "@/lib/gpay-wallet";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/**
 * POST /api/gpay/earn
 * Admin-only manual GPay credit for testing (maps to `manual_credit` in ledger).
 * Body: { userId, amountCents, reason }
 */
export async function POST(request: Request) {
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string; amountCents?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId || !isValidUuid(userId)) {
    return NextResponse.json({ message: "Invalid userId" }, { status: 400 });
  }

  const amountCents = typeof body.amountCents === "number" ? Math.trunc(body.amountCents) : 0;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ message: "amountCents must be a positive integer" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const reference = `gpay_earn_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const result = await gpayLedgerEntry(userId, "admin_credit", amountCents, reference, {
    reason: reason || "admin_earn",
    source: "api/gpay/earn",
  });

  if (!result.success) {
    const dup = result.message.toLowerCase().includes("duplicate");
    return NextResponse.json({ message: result.message }, { status: dup ? 409 : 400 });
  }

  return NextResponse.json({
    ok: true,
    ledgerId: result.ledger_id,
    gpayAvailableBalanceMinor: result.available_minor,
    gpayLifetimeEarnedMinor: result.lifetime_earned_minor,
  });
}
