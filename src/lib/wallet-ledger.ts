/**
 * Secure wallet ledger: all balance changes go through wallet_ledger_entry RPC.
 * Prevents negative balance, duplicate reference, and keeps ledger + balance in sync.
 */

import { createAdminClient } from "@/lib/supabase";

export type WalletLedgerType =
  | "deposit"
  | "withdrawal"
  | "game_play"
  | "game_win"
  | "referral_bonus"
  | "subscription_payment"
  | "commission_payout"
  | "admin_adjustment"
  | "ad_earning";

function supabase() {
  const c = createAdminClient();
  if (!c) throw new Error("Supabase not configured");
  return c;
}

/** PostgREST / Postgres when `public.profiles` is missing from the DB. */
function isMissingProfileRelationError(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("does not exist") && m.includes("profiles");
}

/** Latest running balance from wallet_ledger when wallet_balances/profiles are absent or empty. */
async function getLatestLedgerBalanceCents(userId: string): Promise<number | null> {
  const { data, error } = await supabase()
    .from("wallet_ledger")
    .select("balance_after")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const n = Number((data as { balance_after?: number }).balance_after);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export interface LedgerEntryResult {
  success: true;
  balance_cents: number;
  ledger_id: string;
}

export interface LedgerEntryError {
  success: false;
  message: string;
}

function stripePaymentIdFromReference(reference: string | null | undefined): string | null {
  if (!reference) return null;
  if (reference.startsWith("stripe_pi_")) return reference.slice("stripe_pi_".length);
  if (reference.startsWith("stripe_session_")) return reference.slice("stripe_session_".length);
  return null;
}

async function appendBalanceAuditLog(params: {
  userId: string;
  amountCents: number;
  reason: string;
  reference: string | null | undefined;
  ledgerId: string;
}): Promise<void> {
  const stripe_payment_id = stripePaymentIdFromReference(params.reference);
  const { error } = await supabase().from("balance_audit_log").insert({
    user_id: params.userId,
    amount_cents: params.amountCents,
    reason: params.reason,
    stripe_payment_id,
    reference: params.reference ?? null,
    ledger_id: params.ledgerId,
  });
  if (error) console.error("[balance_audit_log] insert failed:", error.message);
}

/** Atomic ledger entry: insert row + update balance. amount_cents: positive = credit, negative = debit. */
export async function walletLedgerEntry(
  userId: string,
  type: WalletLedgerType,
  amountCents: number,
  reference?: string | null
): Promise<LedgerEntryResult | LedgerEntryError> {
  const { data, error } = await supabase().rpc("wallet_ledger_entry", {
    p_user_id: userId,
    p_type: type,
    p_amount_cents: amountCents,
    p_reference: reference ?? null,
  });
  if (error) return { success: false, message: error.message };
  const r = data as { success?: boolean; message?: string; balance_cents?: number; ledger_id?: string };
  if (r.success && typeof r.balance_cents === "number" && r.ledger_id) {
    await appendBalanceAuditLog({
      userId,
      amountCents,
      reason: type,
      reference,
      ledgerId: r.ledger_id,
    });
    return { success: true, balance_cents: r.balance_cents, ledger_id: r.ledger_id };
  }
  return { success: false, message: (r as { message?: string }).message ?? "Ledger entry failed" };
}

/**
 * Balance from `public.profiles.balance` only (cents). Single source for dashboard/wallet display.
 * Null or missing column value → 0.
 */
export async function getUsersTableBalanceCents(userId: string): Promise<number> {
  const { data, error } = await supabase()
    .from("profiles")
    .select("balance")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    if (isMissingProfileRelationError(error)) {
      return (await getLatestLedgerBalanceCents(userId)) ?? 0;
    }
    return 0;
  }
  if (!data) return 0;
  const b = (data as { balance?: number | null }).balance;
  if (b == null) return 0;
  const n = Number(b);
  return Number.isFinite(n) ? n : 0;
}

/** Get current balance from wallet_balances (or null if table/RPC not used). */
export async function getWalletBalanceCents(userId: string): Promise<number | null> {
  const { data, error } = await supabase()
    .from("wallet_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return Number((data as { balance?: number }).balance ?? 0);
}

/**
 * Ensures public.wallet_balances has a row for this user (ledger + canonical reads).
 * Seeds from profiles.balance when present; if public.profiles is missing, uses latest wallet_ledger balance_after or 0.
 * Does not write profiles table.
 */
export async function ensureWalletBalancesRow(userId: string): Promise<{ ok: true } | { ok: false; message: string; code?: string }> {
  const client = supabase();
  const { data: existing, error: selErr } = await client
    .from("wallet_balances")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) return { ok: false, message: selErr.message, code: selErr.code };
  if (existing) return { ok: true };

  let seed = 0;
  const { data: u, error: uErr } = await client.from("profiles").select("balance").eq("id", userId).maybeSingle();
  if (!uErr && u != null) {
    const seedRaw = (u as { balance?: number | null }).balance;
    seed =
      seedRaw == null || !Number.isFinite(Number(seedRaw)) ? 0 : Math.max(0, Math.round(Number(seedRaw)));
  } else if (uErr && isMissingProfileRelationError(uErr)) {
    seed = (await getLatestLedgerBalanceCents(userId)) ?? 0;
  } else if (uErr) {
    return { ok: false, message: uErr.message, code: uErr.code };
  }

  const { error: insErr } = await client.from("wallet_balances").insert({
    user_id: userId,
    balance: seed,
  });
  if (insErr) {
    if (insErr.code === "23505") return { ok: true };
    return { ok: false, message: insErr.message, code: insErr.code };
  }
  return { ok: true };
}

/**
 * Canonical user balance for dashboard, wallet, and betting (Fight Arena, etc.).
 * Reads wallet_balances first (same source as ledger); falls back to profiles.balance.
 * Use this everywhere so Stripe deposits and betting share one balance.
 */
export async function getCanonicalBalanceCents(userId: string): Promise<number> {
  const walletBalance = await getWalletBalanceCents(userId);
  if (walletBalance !== null) {
    console.log("[balance] getCanonicalBalanceCents", { userId, source: "wallet_balances", balanceCents: walletBalance });
    return walletBalance;
  }
  const { data, error } = await supabase()
    .from("profiles")
    .select("balance")
    .eq("id", userId)
    .maybeSingle();
  if (!error && data) {
    const userBalance = Number((data as { balance?: number }).balance ?? 0);
    console.log("[balance] getCanonicalBalanceCents", { userId, source: "profiles", balanceCents: userBalance });
    return userBalance;
  }
  if (error && !isMissingProfileRelationError(error)) {
    console.warn("[balance] getCanonicalBalanceCents profiles read failed:", error.message);
  }
  const ledgerBalance = await getLatestLedgerBalanceCents(userId);
  if (ledgerBalance !== null) {
    console.log("[balance] getCanonicalBalanceCents", { userId, source: "wallet_ledger", balanceCents: ledgerBalance });
    return ledgerBalance;
  }
  return 0;
}

export interface WalletLedgerRow {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference: string | null;
  created_at: string;
}

/** List ledger entries for a user (newest first). */
export async function getWalletHistory(
  userId: string,
  limit = 50,
  offset = 0
): Promise<WalletLedgerRow[]> {
  const { data, error } = await supabase()
    .from("wallet_ledger")
    .select("id, user_id, type, amount, balance_after, reference, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return (data ?? []) as WalletLedgerRow[];
}

/** Admin: total deposits and withdrawals across all users (from ledger). */
export async function getWalletTotals(): Promise<{
  totalDepositsCents: number;
  totalWithdrawalsCents: number;
  totalBalanceCents: number;
  userCount: number;
}> {
  const [depRes, wdRes, balRes] = await Promise.all([
    supabase().from("wallet_ledger").select("amount").eq("type", "deposit"),
    supabase().from("wallet_ledger").select("amount").eq("type", "withdrawal"),
    supabase().from("wallet_balances").select("balance"),
  ]);
  const sumPositive = (arr: { amount?: number }[] | null) =>
    (arr ?? []).reduce((s, r) => s + Math.max(0, Number(r?.amount ?? 0)), 0);
  const sumWithdrawalMagnitude = (arr: { amount?: number }[] | null) =>
    (arr ?? []).reduce((s, r) => s + Math.abs(Math.min(0, Number(r?.amount ?? 0))), 0);
  const totalDepositsCents = sumPositive((depRes.data ?? []) as { amount: number }[]);
  const totalWithdrawalsCents = sumWithdrawalMagnitude((wdRes.data ?? []) as { amount: number }[]);
  const balances = (balRes.data ?? []) as { balance: number }[];
  const totalBalanceCents = balances.reduce((s, r) => s + Number(r?.balance ?? 0), 0);
  return {
    totalDepositsCents,
    totalWithdrawalsCents,
    totalBalanceCents,
    userCount: balances.length,
  };
}
