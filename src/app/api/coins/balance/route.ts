import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getUserCoins } from "@/lib/coins";

/**
 * GET /api/coins/balance
 * USD (wallet_balances) + GC + GPay Coins (sweeps_coins) for the authenticated user.
 */
export async function GET(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  let balanceCents = 0;
  if (supabase) {
    const { data } = await supabase
      .from("wallet_balances")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    balanceCents = Math.max(0, Math.floor(Number((data as { balance?: number } | null)?.balance ?? 0)));
  }

  const coins = await getUserCoins(userId);

  return NextResponse.json({
    balance_cents: balanceCents,
    gold_coins: coins.goldCoins,
    sweeps_coins: coins.sweepsCoins,
  });
}
