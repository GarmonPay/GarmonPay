import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getUserCoins } from "@/lib/coins";

/**
 * POST /api/coins/convert
 * Convert Gold Coins (GC) → GPay Coins (GPC) using membership tier rate.
 * Body: { amount_gc: number } — min 100, multiple of 100.
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

  let body: { amount_gc?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const amountGc = Math.floor(Number(body.amount_gc));
  if (!Number.isFinite(amountGc) || amountGc < 100 || amountGc % 100 !== 0) {
    return NextResponse.json(
      { message: "amount_gc must be at least 100 and a multiple of 100" },
      { status: 400 }
    );
  }

  const { data: convRaw, error: rpcErr } = await supabase.rpc("convert_gold_to_gpay_coins", {
    p_user_id: userId,
    p_amount_gc: amountGc,
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? "";
    if (/INSUFFICIENT_GOLD|Insufficient gold/i.test(msg)) {
      return NextResponse.json({ message: "Insufficient Gold Coins" }, { status: 400 });
    }
    if (/INVALID_GC_AMOUNT/i.test(msg)) {
      return NextResponse.json(
        { message: "amount_gc must be at least 100 and a multiple of 100" },
        { status: 400 }
      );
    }
    console.error("[coins/convert]", rpcErr);
    return NextResponse.json({ message: "Conversion failed" }, { status: 400 });
  }

  const parsed =
    typeof convRaw === "string" ? (JSON.parse(convRaw) as Record<string, unknown>) : (convRaw as Record<string, unknown> | null);
  const result = parsed as {
    gpay_coins_received?: number;
    conversion_rate?: number;
    membership_tier?: string;
  } | null;

  const gpayReceived = Math.floor(Number(result?.gpay_coins_received ?? 0));
  const rate = Number(result?.conversion_rate ?? 0);
  const tier = String(result?.membership_tier ?? "");

  const ref = `gc_to_gpc_${userId}_${amountGc}_${Date.now()}`;
  const { error: insErr } = await supabase.from("coin_transactions").insert({
    user_id: userId,
    type: "gc_to_gpc",
    gold_coins: -amountGc,
    gpay_coins: gpayReceived,
    description: `Converted ${amountGc} GC → ${gpayReceived} GPC (${tier} rate ${(rate * 100).toFixed(0)}%)`,
    reference: ref,
  });
  if (insErr) {
    console.error("[coins/convert] ledger insert:", insErr.message);
  }

  const balances = await getUserCoins(userId);

  return NextResponse.json({
    success: true,
    gold_coins_spent: amountGc,
    gpay_coins_received: gpayReceived,
    conversion_rate: rate,
    membership_tier: tier,
    new_gold_coins_balance: balances.goldCoins,
    new_gpay_coins_balance: balances.gpayCoins,
  });
}
