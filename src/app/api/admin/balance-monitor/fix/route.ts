import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/admin/balance-monitor/fix
 * Body: { email: string }
 * Inserts a reconciling admin_adjustment row on wallet_ledger so the latest balance_after
 * matches wallet_balances (does not delete ledger rows; does not use wallet_ledger_entry
 * because that would add to wallet_balances again).
 */
export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ message: "email is required" }, { status: 400 });
  }

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (userErr || !userRow) {
    return NextResponse.json({ message: userErr?.message ?? "User not found" }, { status: 404 });
  }

  const userId = (userRow as { id: string }).id;

  const { data: wb, error: wbErr } = await supabase
    .from("wallet_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (wbErr) {
    return NextResponse.json({ message: wbErr.message }, { status: 500 });
  }

  const walletBalanceCents = Math.round(Number((wb as { balance?: number } | null)?.balance ?? 0));

  const { data: latestLedger, error: ledErr } = await supabase
    .from("wallet_ledger")
    .select("balance_after")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ledErr) {
    return NextResponse.json({ message: ledErr.message }, { status: 500 });
  }

  const ledgerLatestCents =
    latestLedger == null
      ? 0
      : Math.round(Number((latestLedger as { balance_after?: number }).balance_after ?? 0));

  const difference = walletBalanceCents - ledgerLatestCents;

  if (difference === 0) {
    return NextResponse.json({ success: true, correctedCents: 0 });
  }

  const reference = `admin_drift_fix_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const { error: insErr } = await supabase.from("wallet_ledger").insert({
    user_id: userId,
    type: "admin_adjustment",
    amount: difference,
    balance_after: walletBalanceCents,
    reference,
  });

  if (insErr) {
    console.error("[admin balance-monitor fix] insert:", insErr.message);
    return NextResponse.json({ message: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, correctedCents: difference });
}
