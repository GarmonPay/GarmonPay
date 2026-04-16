import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { debitGpayCoins } from "@/lib/coins";

/** Loose Solana address check (base58, 32–44 chars). */
function isLikelySolanaAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());
}

/**
 * POST /api/coins/redeem
 * Redeem GPay Coins (GPC) for $GPAY Tokens (custodial or external wallet queue).
 */
export async function POST(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: {
    amount_gpc?: unknown;
    wallet_address?: unknown;
    custodial?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const amountGpc = Math.floor(Number(body.amount_gpc));
  const custodial = body.custodial === true;
  const walletRaw = typeof body.wallet_address === "string" ? body.wallet_address.trim() : "";

  if (!Number.isFinite(amountGpc) || amountGpc < 100) {
    return NextResponse.json({ message: "amount_gpc must be at least 100" }, { status: 400 });
  }

  if (!custodial && !isLikelySolanaAddress(walletRaw)) {
    return NextResponse.json({ message: "Valid Solana wallet address required" }, { status: 400 });
  }

  if (custodial) {
    const refDebit = `redeem_gpay_custodial_${userId}_${amountGpc}_${Date.now()}`;
    const d = await debitGpayCoins(
      userId,
      amountGpc,
      `Redeem ${amountGpc} GPC for $GPAY (custodial)`,
      refDebit
    );
    if (!d.success) {
      return NextResponse.json({ message: d.message ?? "Debit failed" }, { status: 400 });
    }

    const { error: tokErr } = await supabase.rpc("credit_gpay_tokens", {
      p_user_id: userId,
      p_amount: amountGpc,
    });
    if (tokErr) {
      console.error("[coins/redeem] credit_gpay_tokens:", tokErr.message);
      return NextResponse.json({ message: "Could not credit $GPAY Tokens" }, { status: 500 });
    }

    const { data: row, error: insErr } = await supabase
      .from("gpay_redemptions")
      .insert({
        user_id: userId,
        gpay_coins_spent: amountGpc,
        gpay_tokens_received: amountGpc,
        wallet_address: "custodial",
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insErr) {
      console.error("[coins/redeem] insert:", insErr.message);
    }

    return NextResponse.json({
      ok: true,
      mode: "custodial",
      gpay_tokens_received: amountGpc,
      redemption_id: row?.id ?? null,
    });
  }

  const refDebit = `redeem_gpay_wallet_${userId}_${amountGpc}_${Date.now()}`;
  const d = await debitGpayCoins(
    userId,
    amountGpc,
    `Redeem ${amountGpc} GPC for $GPAY (wallet ${walletRaw.slice(0, 8)}…)`,
    refDebit
  );
  if (!d.success) {
    return NextResponse.json({ message: d.message ?? "Debit failed" }, { status: 400 });
  }

  const { data: row, error: insErr } = await supabase
    .from("gpay_redemptions")
    .insert({
      user_id: userId,
      gpay_coins_spent: amountGpc,
      gpay_tokens_received: amountGpc,
      wallet_address: walletRaw,
      status: "pending",
    })
    .select("id, status, wallet_address, created_at")
    .single();

  if (insErr) {
    console.error("[coins/redeem] pending insert:", insErr.message);
    return NextResponse.json({ message: "Could not record redemption" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mode: "wallet",
    pending: true,
    message: "Redemption queued for transfer",
    redemption: row,
  });
}
