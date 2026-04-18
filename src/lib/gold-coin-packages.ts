/** Stripe Gold Coin packs — real-money purchase credits Gold Coins (GC) only. */

export type GoldCoinPackageId = "starter" | "basic" | "value" | "pro" | "elite";

export type GoldCoinPackage = {
  package_id: GoldCoinPackageId;
  gold_coins: number;
  price_cents: number;
  stripe_description: string;
  label: string;
  bestValue?: boolean;
};

export const GOLD_COIN_PACKAGES: Record<GoldCoinPackageId, GoldCoinPackage> = {
  starter: {
    package_id: "starter",
    gold_coins: 500,
    price_cents: 500,
    stripe_description: "GarmonPay Starter Pack - 500 Gold Coins",
    label: "Starter",
  },
  basic: {
    package_id: "basic",
    gold_coins: 1000,
    price_cents: 1000,
    stripe_description: "GarmonPay Basic Pack - 1,000 Gold Coins",
    label: "Basic",
  },
  value: {
    package_id: "value",
    gold_coins: 2500,
    price_cents: 2500,
    stripe_description: "GarmonPay Value Pack - 2,500 Gold Coins",
    label: "Value",
    bestValue: true,
  },
  pro: {
    package_id: "pro",
    gold_coins: 5000,
    price_cents: 5000,
    stripe_description: "GarmonPay Pro Pack - 5,000 Gold Coins",
    label: "Pro",
  },
  elite: {
    package_id: "elite",
    gold_coins: 10000,
    price_cents: 10000,
    stripe_description: "GarmonPay Elite Pack - 10,000 Gold Coins",
    label: "Elite",
  },
};

export function getGoldCoinPackage(id: string): GoldCoinPackage | null {
  const k = id.trim().toLowerCase() as GoldCoinPackageId;
  return GOLD_COIN_PACKAGES[k] ?? null;
}

/**
 * Map a `gc_packages` row to a catalog key when GC + price match the fixed catalog
 * (avoids UUID vs "starter" mismatch on checkout).
 */
export function matchDbPackageToCanonicalId(row: {
  gold_coins: number;
  price_cents: number;
  name?: string;
}): GoldCoinPackageId | null {
  for (const id of Object.keys(GOLD_COIN_PACKAGES) as GoldCoinPackageId[]) {
    const p = GOLD_COIN_PACKAGES[id];
    if (p.gold_coins === row.gold_coins && p.price_cents === row.price_cents) {
      return id;
    }
  }
  return null;
}
