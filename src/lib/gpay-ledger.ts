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

export interface GpayLedgerEntryRow {
  id: string;
  event_type: string;
  amount_minor: number;
  reference: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Read-only ledger history for one user (newest first). Server-side only; caller must enforce auth.
 */
export async function listGpayLedgerEntries(
  userId: string,
  options: { limit?: number; offset?: number }
): Promise<{ rows: GpayLedgerEntryRow[]; hasMore: boolean }> {
  const rawLimit = options.limit ?? 50;
  const limit = Math.min(Math.max(Math.floor(Number(rawLimit)) || 50, 1), 100);
  const offset = Math.max(Math.floor(Number(options.offset ?? 0)) || 0, 0);
  const fetchLimit = limit + 1;
  const { data, error } = await supabase()
    .from("gpay_ledger")
    .select("id, event_type, amount_minor, reference, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + fetchLimit - 1);
  if (error) {
    console.error("[gpay-ledger] listGpayLedgerEntries:", error.message);
    return { rows: [], hasMore: false };
  }
  const list = (data ?? []) as Record<string, unknown>[];
  const hasMore = list.length > limit;
  const sliced = hasMore ? list.slice(0, limit) : list;
  const rows: GpayLedgerEntryRow[] = sliced.map((r) => ({
    id: String(r.id ?? ""),
    event_type: String(r.event_type ?? ""),
    amount_minor: Math.trunc(Number(r.amount_minor ?? 0)),
    reference: r.reference == null ? null : String(r.reference),
    metadata:
      typeof r.metadata === "object" && r.metadata !== null && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {},
    created_at: String(r.created_at ?? ""),
  }));
  return { rows, hasMore };
}

export interface GpayClaimRow {
  id: string;
  amount_minor: number;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  completed_at: string | null;
  reject_reason: string | null;
}

/**
 * Read-only: signed-in user's GPay claims (caller must enforce auth). Newest first by requested_at.
 */
export async function listGpayClaimsForUser(userId: string): Promise<GpayClaimRow[]> {
  const { data, error } = await supabase()
    .from("gpay_claims")
    .select("id, amount_minor, status, requested_at, reviewed_at, completed_at, reject_reason")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false });
  if (error) {
    console.error("[gpay-ledger] listGpayClaimsForUser:", error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      amount_minor: Math.trunc(Number(row.amount_minor ?? 0)),
      status: String(row.status ?? ""),
      requested_at: String(row.requested_at ?? ""),
      reviewed_at: row.reviewed_at == null ? null : String(row.reviewed_at),
      completed_at: row.completed_at == null ? null : String(row.completed_at),
      reject_reason: row.reject_reason == null ? null : String(row.reject_reason),
    };
  });
}
