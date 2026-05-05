import { NextResponse } from "next/server";
import { getAuthUserIdBearerOrCookie } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getUserCoins } from "@/lib/coins";
import { gpcPlatformFeeFromGc, gpcReceivedFromGc } from "@/lib/gc-gpc-convert";

/** Must match `@/lib/gc-gpc-convert` and `public.convert_gold_to_gpay_coins`. */
const GC_TO_GPC_RATE = 97; // 1 GC = 100 GPC base, 3% platform fee
const PLATFORM_FEE_PCT = 0.03;

/**
 * POST /api/coins/convert
 * Convert Gold Coins (GC) → GPay Coins (GPC): 97 GPC per 1 GC (3% fee on 100 nominal).
 * Body: { amount_gc: number } — min 100, multiple of 100.
 */
function parseRpcConversionResult(convRaw: unknown): {
  gpay_coins_received?: number;
  conversion_rate?: number;
  membership_tier?: string;
  gpc_fee_amount?: number;
  gpc_nominal_before_fee?: number;
} | null {
  if (convRaw == null) return null;
  if (typeof convRaw === "object" && !Array.isArray(convRaw)) {
    return convRaw as {
      gpay_coins_received?: number;
      conversion_rate?: number;
      membership_tier?: string;
      gpc_fee_amount?: number;
      gpc_nominal_before_fee?: number;
    };
  }
  if (typeof convRaw === "string") {
    try {
      return JSON.parse(convRaw) as {
        gpay_coins_received?: number;
        conversion_rate?: number;
        membership_tier?: string;
        gpc_fee_amount?: number;
        gpc_nominal_before_fee?: number;
      };
    } catch {
      return null;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const userId = await getAuthUserIdBearerOrCookie(request);
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

  const amount = amountGc;
  const { data: convRaw, error: rpcErr } = await supabase.rpc(
    "convert_gold_to_gpay_coins",
    {
      p_user_id: userId,
      p_amount_gc: amount,
    }
  );

  if (rpcErr) {
    const msg = rpcErr.message ?? "";
    const code = (rpcErr as { code?: string }).code ?? "";
    if (/INSUFFICIENT_GOLD|Insufficient gold/i.test(msg)) {
      return NextResponse.json({ message: "Insufficient Gold Coins" }, { status: 400 });
    }
    if (/INVALID_GC_AMOUNT/i.test(msg)) {
      return NextResponse.json(
        { message: "amount_gc must be at least 100 and a multiple of 100" },
        { status: 400 }
      );
    }
    if (/USER_NOT_FOUND/i.test(msg)) {
      return NextResponse.json(
        { message: "Profile not found. Try refreshing the page or signing in again." },
        { status: 400 }
      );
    }
    console.error("[coins/convert] RPC error:", { message: msg, code, details: (rpcErr as { details?: string }).details });
    const userFacing =
      msg && !/violates|constraint|column|relation|permission/i.test(msg)
        ? msg.replace(/^ERROR:\s*/i, "").trim()
        : "Could not complete conversion. Please try again.";
    return NextResponse.json({ message: userFacing || "Could not complete conversion." }, { status: 400 });
  }

  const result = parseRpcConversionResult(convRaw);
  if (!result) {
    console.error("[coins/convert] Unexpected RPC payload:", convRaw);
    return NextResponse.json({ message: "Invalid response from conversion service." }, { status: 500 });
  }

  const gpayReceived = Math.floor(Number(result?.gpay_coins_received ?? 0));
  const rate = Number(result?.conversion_rate ?? 0);
  const tier = String(result?.membership_tier ?? "");

  const feeParsed = Math.floor(Number(result?.gpc_fee_amount));
  const feeGpc =
    Number.isFinite(feeParsed) && feeParsed >= 0 ? feeParsed : gpcPlatformFeeFromGc(amountGc);

  const nominalParsed = Math.floor(Number(result?.gpc_nominal_before_fee));
  const nominalGpc =
    Number.isFinite(nominalParsed) && nominalParsed > 0 ? nominalParsed : amountGc * 100;

  const expectedReceive = gpcReceivedFromGc(amountGc);
  if (gpayReceived !== expectedReceive) {
    console.error("[coins/convert] RPC amount mismatch vs app rate", {
      amountGc,
      gpayReceived,
      expectedReceive,
      rate,
    });
  }

  const ref = `gc_to_gpc_${userId}_${amountGc}_${Date.now()}`;
  const { error: insErr } = await supabase.from("coin_transactions").insert({
    user_id: userId,
    type: "gc_to_gpc",
    gold_coins: -amountGc,
    gpay_coins: gpayReceived,
    description: `Converted ${amountGc} GC → ${gpayReceived} GPC (1 GC = ${GC_TO_GPC_RATE} GPC; ${(PLATFORM_FEE_PCT * 100).toFixed(0)}% fee = ${feeGpc} GPC; ${tier})`,
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
    gpc_fee_amount: feeGpc,
    gpc_nominal_before_fee: nominalGpc,
    conversion_rate: rate,
    membership_tier: tier,
    new_gold_coins_balance: balances.goldCoins,
    new_gpay_coins_balance: balances.gpayCoins,
  });
}
