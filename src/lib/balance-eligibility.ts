import { createAdminClient } from "@/lib/supabase";

const HOLD_MS = 7 * 24 * 60 * 60 * 1000;

/** Wallet credits from Stripe Checkout / recovery use these reference prefixes. */
export function isStripeWalletDepositReference(reference: string | null | undefined): boolean {
  const ref = (reference ?? "").trim();
  if (!ref) return false;
  if (ref.startsWith("stripe_session_")) return true;
  if (ref.startsWith("stripe_pi_")) return true;
  if (ref.startsWith("stripe_")) return true;
  if (ref.startsWith("pi_")) return true;
  if (ref.startsWith("cs_")) return true;
  return ref.toLowerCase().includes("stripe");
}

export type EligibleUpgradeBalance = {
  totalBalance: number;
  eligibleBalance: number;
  heldBalance: number;
  heldUntil: Date | null;
};

export async function getEligibleUpgradeBalance(userId: string): Promise<EligibleUpgradeBalance> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      totalBalance: 0,
      eligibleBalance: 0,
      heldBalance: 0,
      heldUntil: null,
    };
  }

  const { data: wallet } = await supabase
    .from("wallet_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  const totalBalance = Math.round(
    Number((wallet as { balance?: number | null } | null)?.balance ?? 0)
  );
  if (!Number.isFinite(totalBalance)) {
    return { totalBalance: 0, eligibleBalance: 0, heldBalance: 0, heldUntil: null };
  }

  const sevenDaysAgo = new Date(Date.now() - HOLD_MS).toISOString();

  const { data: recentDeposits } = await supabase
    .from("wallet_ledger")
    .select("amount, created_at, reference")
    .eq("user_id", userId)
    .eq("type", "deposit")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false });

  const rows = (recentDeposits ?? []) as {
    amount?: number | null;
    created_at?: string;
    reference?: string | null;
  }[];

  const stripeHeldRows = rows.filter((row) => {
    const amt = Number(row.amount ?? 0);
    return amt > 0 && isStripeWalletDepositReference(row.reference);
  });

  const heldAmount = stripeHeldRows.reduce((sum, row) => sum + Math.round(Number(row.amount ?? 0)), 0);

  let heldUntil: Date | null = null;
  if (stripeHeldRows.length > 0) {
    const maxCreated = Math.max(
      ...stripeHeldRows.map((row) => new Date(row.created_at ?? 0).getTime()).filter((t) => Number.isFinite(t))
    );
    if (Number.isFinite(maxCreated)) {
      heldUntil = new Date(maxCreated + HOLD_MS);
    }
  }

  const eligibleBalance = Math.max(0, totalBalance - heldAmount);

  return {
    totalBalance,
    eligibleBalance,
    heldBalance: heldAmount,
    heldUntil,
  };
}
