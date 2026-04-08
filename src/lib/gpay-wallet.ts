/**
 * Thin GPay helpers (minor units). Delegates to `gpay-ledger` + `gpay_ledger_entry` RPC.
 * Does not touch USD `wallet_ledger` / Stripe.
 */

import { createAdminClient } from "@/lib/supabase";
import {
  gpayLedgerEntry as gpayLedgerEntryRpc,
  getGpayBalanceSnapshot,
  type GpayLedgerEventType,
  type GpayLedgerResult,
} from "./gpay-ledger";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

/** User-facing types mapped to DB `event_type` values. */
export type GpayWalletLedgerType = "task_reward" | "game_reward" | "admin_credit" | "redemption";

function mapWalletTypeToRpc(
  type: GpayWalletLedgerType,
  amountMinor: number
): { eventType: GpayLedgerEventType; amountMinor: number } {
  switch (type) {
    case "task_reward":
      return { eventType: "reward_earn", amountMinor };
    case "game_reward":
      return { eventType: "game_reward", amountMinor };
    case "admin_credit":
      return { eventType: "manual_credit", amountMinor };
    case "redemption":
      return { eventType: "manual_debit", amountMinor: -Math.abs(amountMinor) };
    default:
      return { eventType: "manual_credit", amountMinor };
  }
}

/**
 * Append-only GPay movement via RPC (updates `gpay_balances` atomically).
 * Idempotent when `reference` is reused (RPC returns duplicate error).
 */
export async function gpayLedgerEntry(
  userId: string,
  type: GpayWalletLedgerType,
  amountCents: number,
  reference: string,
  metadata?: Record<string, unknown> | null
): Promise<GpayLedgerResult> {
  const minor = Math.trunc(Number(amountCents));
  const { eventType, amountMinor } = mapWalletTypeToRpc(type, minor);
  return gpayLedgerEntryRpc(userId, eventType, amountMinor, reference, metadata ?? undefined);
}

/** Latest running available balance from the most recent `gpay_ledger` row (minor units). */
export async function getGpayBalanceCents(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from("gpay_ledger")
    .select("available_after_minor")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!error && data) {
    const n = Number((data as { available_after_minor?: number }).available_after_minor);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  const snap = await getGpayBalanceSnapshot(userId);
  return snap.available_minor;
}

/** Lifetime earned (minor units) from `gpay_balances`. */
export async function getGpayLifetimeEarned(userId: string): Promise<number> {
  const snap = await getGpayBalanceSnapshot(userId);
  return snap.lifetime_earned_minor;
}
