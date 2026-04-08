/**
 * GPay Balance: internal reward ledger (minor units). Independent from USD wallet_balances / wallet_ledger.
 * All writes go through public.gpay_ledger_entry RPC (duplicate reference, non-negative buckets).
 */

import { createAdminClient } from "@/lib/supabase";

export type GpayLedgerEventType =
  | "reward_earn"
  | "referral_reward"
  | "game_reward"
  | "ad_reward"
  | "manual_credit"
  | "manual_debit"
  | "admin_adjustment"
  | "claim_reserve"
  | "claim_release"
  | "claim_settle";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

export interface GpayLedgerSuccess {
  success: true;
  ledger_id: string;
  available_minor: number;
  pending_claim_minor: number;
  claimed_lifetime_minor: number;
  lifetime_earned_minor: number;
}

export interface GpayLedgerError {
  success: false;
  message: string;
}

export type GpayLedgerResult = GpayLedgerSuccess | GpayLedgerError;

/**
 * Append-only GPay movement + atomic gpay_balances update.
 * - Earn types / manual_credit: positive amount_minor.
 * - manual_debit: negative amount_minor.
 * - admin_adjustment: non-zero signed; positive credits lifetime_earned; negative does not.
 * - claim_*: positive magnitude; claim_reserve moves available → pending; claim_release reverses; claim_settle pending → claimed.
 */
export async function gpayLedgerEntry(
  userId: string,
  eventType: GpayLedgerEventType,
  amountMinor: number,
  reference?: string | null,
  metadata?: Record<string, unknown> | null
): Promise<GpayLedgerResult> {
  const { data, error } = await supabase().rpc("gpay_ledger_entry", {
    p_user_id: userId,
    p_event_type: eventType,
    p_amount_minor: amountMinor,
    p_reference: reference ?? null,
    p_metadata: metadata ?? {},
  });
  if (error) return { success: false, message: error.message };
  const r = data as {
    success?: boolean;
    message?: string;
    ledger_id?: string;
    available_minor?: number;
    pending_claim_minor?: number;
    claimed_lifetime_minor?: number;
    lifetime_earned_minor?: number;
  };
  if (
    r.success &&
    typeof r.ledger_id === "string" &&
    typeof r.available_minor === "number" &&
    typeof r.pending_claim_minor === "number" &&
    typeof r.claimed_lifetime_minor === "number" &&
    typeof r.lifetime_earned_minor === "number"
  ) {
    return {
      success: true,
      ledger_id: r.ledger_id,
      available_minor: r.available_minor,
      pending_claim_minor: r.pending_claim_minor,
      claimed_lifetime_minor: r.claimed_lifetime_minor,
      lifetime_earned_minor: r.lifetime_earned_minor,
    };
  }
  return { success: false, message: (r as { message?: string }).message ?? "GPay ledger entry failed" };
}

/** Read current GPay buckets; returns zeros if no row (user has never had GPay activity). */
export async function getGpayBalanceSnapshot(userId: string): Promise<{
  available_minor: number;
  pending_claim_minor: number;
  claimed_lifetime_minor: number;
  lifetime_earned_minor: number;
}> {
  const { data, error } = await supabase()
    .from("gpay_balances")
    .select("available_minor, pending_claim_minor, claimed_lifetime_minor, lifetime_earned_minor")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) {
    return {
      available_minor: 0,
      pending_claim_minor: 0,
      claimed_lifetime_minor: 0,
      lifetime_earned_minor: 0,
    };
  }
  const row = data as Record<string, unknown>;
  const n = (k: string) => {
    const v = row[k];
    const x = Number(v);
    return Number.isFinite(x) ? Math.trunc(x) : 0;
  };
  return {
    available_minor: n("available_minor"),
    pending_claim_minor: n("pending_claim_minor"),
    claimed_lifetime_minor: n("claimed_lifetime_minor"),
    lifetime_earned_minor: n("lifetime_earned_minor"),
  };
}
