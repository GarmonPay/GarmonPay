import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { creditCoins } from "@/lib/coins";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_SC_PER_REQUEST = 500_000; // $5,000 face at 100 SC / $1 — adjust if policy changes

/**
 * POST /api/admin/users/credit-sweeps
 * Body: { userId: string, amountSc: number, reason?: string }
 * Credits GPay Coins (DB: sweeps_coins) via credit_coins RPC + coin_transactions (support / reconciliation).
 */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { userId?: string; amountSc?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId || !UUID_RE.test(userId)) {
    return NextResponse.json({ message: "Invalid userId" }, { status: 400 });
  }

  const amountSc = typeof body.amountSc === "number" ? Math.trunc(body.amountSc) : 0;
  if (!Number.isFinite(amountSc) || amountSc <= 0) {
    return NextResponse.json({ message: "amountSc must be a positive integer" }, { status: 400 });
  }
  if (amountSc > MAX_SC_PER_REQUEST) {
    return NextResponse.json(
      { message: `amountSc exceeds maximum (${MAX_SC_PER_REQUEST} GPC per request)` },
      { status: 400 }
    );
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const reference = `admin_sc_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const description = reason
    ? `Admin GPay Coins credit: ${reason}`
    : "Admin GPay Coins credit (support / reconciliation)";

  const result = await creditCoins(userId, 0, amountSc, description, reference, "admin_sc_credit");

  if (!result.success) {
    const dup = (result.message ?? "").toLowerCase().includes("duplicate");
    return NextResponse.json({ message: result.message ?? "Credit failed" }, { status: dup ? 409 : 400 });
  }

  return NextResponse.json({
    ok: true,
    amountSc,
    reference,
    description,
  });
}
