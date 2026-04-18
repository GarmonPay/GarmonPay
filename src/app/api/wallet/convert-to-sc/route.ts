import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { walletLedgerEntry, getCanonicalBalanceCents } from "@/lib/wallet-ledger";
import { rpcCreditCoins, USD_TO_GPC } from "@/lib/coins";

/**
 * POST /api/wallet/convert-to-sc
 * Body: { amount_cents: number } — $1.00 = 100 SC (amount_cents → SC 1:1 with cents).
 */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  let body: { amount_cents?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amount_cents = Math.floor(Number(body.amount_cents));
  if (!Number.isFinite(amount_cents) || amount_cents < 100) {
    return NextResponse.json({ error: "Minimum conversion is $1.00" }, { status: 400 });
  }

  const balance = await getCanonicalBalanceCents(userId);
  if (balance < amount_cents) {
    return NextResponse.json({ error: "Insufficient USD balance" }, { status: 400 });
  }

  /** $1 = 100 SC → SC awarded equals dollar cents (e.g. 500¢ → 500 SC). */
  const scToAward = Math.floor((amount_cents * USD_TO_GPC) / 100);
  if (scToAward <= 0) {
    return NextResponse.json({ error: "Amount too small to convert" }, { status: 400 });
  }

  const debitRef = `usd_to_sc_${userId}_${amount_cents}_${Date.now()}`;
  const deductResult = await walletLedgerEntry(userId, "game_play", -amount_cents, debitRef);

  if (!deductResult.success) {
    return NextResponse.json(
      { error: deductResult.message || "Failed to deduct balance" },
      { status: 500 }
    );
  }

  const { error: rpcErr } = await rpcCreditCoins(supabase, userId, 0, scToAward);

  if (rpcErr) {
    const refundRef = `usd_to_sc_refund_${userId}_${Date.now()}`;
    await walletLedgerEntry(userId, "admin_adjustment", amount_cents, refundRef);
    return NextResponse.json({ error: "Failed to credit GPay Coins" }, { status: 500 });
  }

  const logRef = `usd_to_sc_log_${userId}_${Date.now()}`;
  const { error: insErr } = await supabase.from("coin_transactions").insert({
    user_id: userId,
    type: "usd_to_sc",
    gold_coins: 0,
    gpay_coins: scToAward,
    description: `Converted $${(amount_cents / 100).toFixed(2)} USD to ${scToAward} GPC`,
    reference: logRef,
  });
  if (insErr) {
    console.error("[convert-to-sc] coin_transactions insert:", insErr.message);
  }

  return NextResponse.json({
    success: true,
    sc_awarded: scToAward,
    new_usd_balance: deductResult.balance_cents,
    message: `Successfully converted to ${scToAward} GPay Coins`,
  });
}
