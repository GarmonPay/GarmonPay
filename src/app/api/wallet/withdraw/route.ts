import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { walletLedgerEntry } from "@/lib/wallet-ledger";
import { createAdminClient } from "@/lib/supabase";
import { normalizeUserMembershipTier } from "@/lib/garmon-plan-config";
import { normalizeWithdrawalMethod } from "@/lib/withdrawal-methods";

const MIN_BY_PLAN_CENTS: Record<string, number> = {
  free: 2000,
  starter: 1000,
  growth: 500,
  pro: 200,
  elite: 100,
};

/**
 * POST /api/wallet/withdraw
 *
 * Canonical withdrawal rows live in `public.withdrawals` (RPC + admin PATCH flow). The optional insert into
 * `withdrawal_requests` is auxiliary / legacy compatibility only — **admin lists and approves using `withdrawals`**.
 *
 * Debit wallet via ledger (atomic), then insert into `withdrawals` (pending).
 * Fraud: strict auth, negative balance prevented in RPC, duplicate reference per request.
 */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { amountCents?: number; amount?: number; method?: string; walletAddress?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const amountCents =
    typeof body.amountCents === "number"
      ? Math.round(body.amountCents)
      : typeof body.amount === "number"
        ? Math.round(body.amount * 100)
        : 0;

  const method = normalizeWithdrawalMethod(body.method ?? "gpay_tokens");
  if (!method) {
    return NextResponse.json({ error: "Invalid method" }, { status: 400 });
  }

  const walletAddress = String(body.walletAddress ?? "").trim();
  if (!walletAddress) {
    return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const { data: userPlanRow } = await supabase
    .from("users")
    .select("membership")
    .eq("id", userId)
    .maybeSingle();
  const plan = normalizeUserMembershipTier((userPlanRow as { membership?: string } | null)?.membership);
  const minCents = MIN_BY_PLAN_CENTS[plan] ?? 1000;

  if (!Number.isFinite(amountCents) || amountCents < minCents) {
    return NextResponse.json(
      { error: `Minimum withdrawal is $${(minCents / 100).toFixed(2)} for ${plan} plan` },
      { status: 400 }
    );
  }

  const ref = `withdraw_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const ledgerResult = await walletLedgerEntry(userId, "withdrawal", -amountCents, ref);

  if (!ledgerResult.success) {
    return NextResponse.json(
      { error: ledgerResult.message ?? "Insufficient balance" },
      { status: 400 }
    );
  }

  const platformFee = Math.round(amountCents * 0.1);
  const netAmount = amountCents - platformFee;

  const { data: withdrawalRow, error: insertErr } = await supabase
    .from("withdrawals")
    .insert({
      user_id: userId,
      amount: amountCents,
      platform_fee: platformFee,
      net_amount: netAmount,
      status: "pending",
      method,
      wallet_address: walletAddress,
    })
    .select("id, amount, platform_fee, net_amount, status, method, wallet_address, created_at")
    .single();

  if (insertErr || !withdrawalRow) {
    console.error("Withdrawal insert after ledger error:", insertErr);
    const refund = await walletLedgerEntry(userId, "admin_adjustment", amountCents, `refund_${ref}`);
    if (!refund.success) console.error("Refund after failed withdrawal insert:", refund.message);
    return NextResponse.json({ error: "Withdrawal request failed" }, { status: 500 });
  }

  const { data: uRow } = await supabase.from("users").select("withdrawable_balance, pending_balance").eq("id", userId).single();
  const w = (uRow as { withdrawable_balance?: number; pending_balance?: number }) ?? {};
  const newWithdrawable = Math.max(0, Number(w.withdrawable_balance ?? 0) - amountCents);
  const newPending = Number(w.pending_balance ?? 0) + amountCents;
  await supabase.from("users").update({ withdrawable_balance: newWithdrawable, pending_balance: newPending, updated_at: new Date().toISOString() }).eq("id", userId);

  await supabase.from("transactions").insert({
    user_id: userId,
    type: "withdrawal",
    amount: amountCents,
    status: "pending",
    description: "Withdrawal request",
    reference_id: (withdrawalRow as { id: string }).id,
  }).then(({ error }) => { if (error) console.error("Wallet withdraw tx insert:", error.message); });

  await supabase.from("withdrawal_requests").insert({
    user_id: userId,
    amount_cents: amountCents,
    status: "pending",
    stripe_email: walletAddress,
    notes: `method=${method}`,
  }).then(({ error }) => {
    if (error) console.warn("[wallet/withdraw] withdrawal_requests insert failed:", error.message);
  });

  return NextResponse.json({
    success: true,
    balance_cents: ledgerResult.balance_cents,
    withdrawal: {
      id: (withdrawalRow as { id: string }).id,
      amount: (withdrawalRow as { amount: number }).amount,
      platform_fee: (withdrawalRow as { platform_fee: number }).platform_fee,
      net_amount: (withdrawalRow as { net_amount: number }).net_amount,
      status: (withdrawalRow as { status: string }).status,
      method: (withdrawalRow as { method: string }).method,
      wallet_address: (withdrawalRow as { wallet_address: string }).wallet_address,
      created_at: (withdrawalRow as { created_at: string }).created_at,
    },
  });
}
