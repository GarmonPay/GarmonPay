/**
 * Platform profit protection.
 * - total_rewards_paid <= total_revenue_generated
 * - Never pay out more than available platform balance.
 * All reward payouts (ads, games, referral) should use canAffordPayout + recordPayout.
 * All revenue (ad views, Stripe fees, game house edge) should use recordRevenue.
 */

import { createAdminClient } from "@/lib/supabase";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

const ROW_ID = "default";

export interface PlatformBalanceRow {
  balance_cents: number;
  total_revenue_cents: number;
  total_rewards_paid_cents: number;
}

/** Get current platform balance row. */
export async function getPlatformBalance(): Promise<PlatformBalanceRow | null> {
  const { data, error } = await supabase()
    .from("platform_balance")
    .select("balance_cents, total_revenue_cents, total_rewards_paid_cents")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    balance_cents: Number(d.balance_cents ?? 0),
    total_revenue_cents: Number(d.total_revenue_cents ?? 0),
    total_rewards_paid_cents: Number(d.total_rewards_paid_cents ?? 0),
  };
}

/** Check if platform can afford to pay amount_cents and total_rewards would not exceed total_revenue. */
export async function canAffordPayout(amountCents: number): Promise<{ allowed: boolean; message?: string }> {
  if (amountCents <= 0) return { allowed: true };
  const row = await getPlatformBalance();
  if (!row) return { allowed: true }; // No platform_balance table or row: allow (e.g. migration not run)
  const newTotalRewards = row.total_rewards_paid_cents + amountCents;
  if (newTotalRewards > row.total_revenue_cents) {
    return { allowed: false, message: "Payout would exceed total revenue generated" };
  }
  if (row.balance_cents < amountCents) {
    return { allowed: false, message: "Insufficient platform balance" };
  }
  return { allowed: true };
}

/** Record revenue (e.g. ad sale, withdrawal fee). Increases balance and total_revenue. */
export async function recordRevenue(amountCents: number, source: string): Promise<boolean> {
  if (amountCents <= 0) return true;
  const { error } = await supabase().rpc("platform_record_revenue", {
    p_amount_cents: amountCents,
    p_source: source,
  });
  if (error) {
    if (error.code === "42883" || error.message?.includes("does not exist")) return true; // RPC not present: skip
    console.error("[platform_balance] recordRevenue error:", error);
    return false;
  }
  return true;
}

/** Record a payout to a user. Decreases balance and increases total_rewards_paid. Call only after canAffordPayout. */
export async function recordPayout(amountCents: number, source: string): Promise<boolean> {
  if (amountCents <= 0) return true;
  const { error } = await supabase().rpc("platform_record_payout", {
    p_amount_cents: amountCents,
    p_source: source,
  });
  if (error) {
    if (error.code === "42883" || error.message?.includes("does not exist")) return true; // RPC not present: skip
    console.error("[platform_balance] recordPayout error:", error);
    return false;
  }
  return true;
}
