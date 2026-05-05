import { createAdminClient } from "@/lib/supabase";

export type EligibleUpgradeBalance = {
  eligible: boolean;
  goldCoins: number;
  shortfall: number;
};

export async function getEligibleUpgradeBalance(
  userId: string,
  priceInDollars: number
): Promise<EligibleUpgradeBalance> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { eligible: false, goldCoins: 0, shortfall: Math.max(0, Math.ceil(priceInDollars)) };
  }

  const { data: user } = await supabase
    .from("users")
    .select("gold_coins")
    .eq("id", userId)
    .maybeSingle();

  const goldCoins = Math.max(
    0,
    Math.floor(Number((user as { gold_coins?: number | null } | null)?.gold_coins ?? 0))
  );
  // 1 GC = $1. We intentionally round UP tier USD prices (e.g. $9.99 -> 10 GC)
  // to avoid platform shortfalls from sub-dollar fractions.
  const priceInGc = Math.max(0, Math.ceil(priceInDollars));
  const shortfall = Math.max(0, priceInGc - goldCoins);

  return {
    eligible: shortfall === 0,
    goldCoins,
    shortfall,
  };
}
