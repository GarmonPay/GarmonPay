import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { gpayLedgerEntry } from "@/lib/gpay-ledger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/users/credit-gpay
 * Body: { userId: string, amountCents: number, reason?: string }
 * Credits GPay via gpay_ledger_entry (manual_credit).
 */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { userId?: string; amountCents?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ message: "Invalid userId" }, { status: 400 });
  }

  const amountMinor = typeof body.amountCents === "number" ? Math.trunc(body.amountCents) : 0;
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    return NextResponse.json({ message: "amountCents must be a positive integer (minor units)" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const reference = `admin_gpay_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const result = await gpayLedgerEntry(userId, "manual_credit", amountMinor, reference, {
    reason: reason || "admin_credit",
  });

  if (!result.success) {
    const dup = result.message.toLowerCase().includes("duplicate");
    return NextResponse.json({ message: result.message }, { status: dup ? 409 : 400 });
  }

  return NextResponse.json({
    ok: true,
    ledger_id: result.ledger_id,
    gpayAvailableBalanceMinor: result.available_minor,
    gpayLifetimeEarnedMinor: result.lifetime_earned_minor,
    reference,
  });
}
