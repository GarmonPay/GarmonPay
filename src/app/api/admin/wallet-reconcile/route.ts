import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { getUsdWalletLedgerSummary } from "@/lib/usd-wallet-balance";

/**
 * GET /api/admin/wallet-reconcile?email=... or ?userId=...
 * Admin-only: ledger-based USD breakdown + drift vs wallet_balances row.
 */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Service unavailable" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  let userId = searchParams.get("userId")?.trim() ?? "";

  if (!userId && email) {
    const { data: u, error } = await admin.from("users").select("id").ilike("email", email).maybeSingle();
    if (error || !u) {
      return NextResponse.json({ ok: false, message: error?.message ?? "User not found" }, { status: 404 });
    }
    userId = (u as { id: string }).id;
  }

  if (!userId) {
    return NextResponse.json({ ok: false, message: "Provide email or userId" }, { status: 400 });
  }

  try {
    const summary = await getUsdWalletLedgerSummary(userId);
    const drift =
      summary.walletBalancesRowCents != null
        ? summary.walletBalancesRowCents - summary.availableBalanceCents
        : null;

    return NextResponse.json({
      ok: true,
      userId,
      emailHint: email || null,
      depositsTotalCents: summary.totalDepositsCents,
      earningsTotalCents: summary.totalEarningsCents,
      withdrawalsTotalCents: summary.totalWithdrawnCents,
      adminCreditsTotalCents: summary.totalAdminCreditsCents,
      adminDebitsTotalCents: summary.totalAdminDebitsCents,
      subscriptionPaymentsTotalCents: summary.totalSubscriptionPaymentCents,
      gamePlayTotalCents: summary.totalGamePlayCents,
      usdToAdCreditFromTransactionsCents: summary.totalUsdToAdCreditFromTransactionsCents,
      walletBalancesRowCents: summary.walletBalancesRowCents,
      ledgerDerivedAvailableCents: summary.availableBalanceCents,
      driftWalletBalancesMinusLedgerCents: drift,
      formulaNote:
        "available = latest wallet_ledger.balance_after; totals are sums by type on wallet_ledger (+ ad_credit from transactions table only for legacy convert path).",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Reconcile failed" },
      { status: 500 }
    );
  }
}
