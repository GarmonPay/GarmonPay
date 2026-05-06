import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaidMembershipTierId } from "@/lib/membership-balance-prices";

const RENEWAL_MS = 30 * 24 * 60 * 60 * 1000;

function computePeriodEndIso(extendFromIso: string | null | undefined): string {
  const nowMs = Date.now();
  if (!extendFromIso) {
    return new Date(nowMs + RENEWAL_MS).toISOString();
  }
  const extMs = new Date(extendFromIso).getTime();
  const base = Number.isFinite(extMs) ? Math.max(nowMs, extMs) : nowMs;
  return new Date(base + RENEWAL_MS).toISOString();
}

/** PostgREST / Supabase: RPC missing, not migrated, or not in schema cache yet. */
export function isPurchaseMembershipRpcMissingError(err: { message?: string; code?: string } | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  if (err.code === "PGRST202") return true;
  if (m.includes("could not find the function")) return true;
  if (m.includes("schema cache")) return true;
  return false;
}

/** RPC applied but DB missing columns (e.g. rewire migration not run on remote). */
function isPurchaseMembershipRpcSchemaDriftError(err: { message?: string } | null): boolean {
  if (!err?.message) return false;
  const m = err.message.toLowerCase();
  if (!m.includes("does not exist")) return false;
  return (
    m.includes("membership_period_end") ||
    m.includes("membership_started_at") ||
    m.includes("membership_purchases")
  );
}

function shouldUsePurchaseMembershipFallback(err: { message?: string; code?: string } | null): boolean {
  return isPurchaseMembershipRpcMissingError(err) || isPurchaseMembershipRpcSchemaDriftError(err);
}

type RpcPurchaseResult =
  | { success: true; period_end: string | null; remaining_gold: number }
  | { success: false; message: string };

export async function purchaseMembershipWithBalanceRpc(
  admin: SupabaseClient,
  userId: string,
  tier: PaidMembershipTierId,
  priceGc: number,
  extendFromIso: string | null | undefined
): Promise<RpcPurchaseResult> {
  const { data, error } = await admin.rpc("purchase_membership_with_balance_v2", {
    p_user_id: userId,
    p_tier: tier,
    p_price_gc: priceGc,
    p_extend_from: extendFromIso ?? null,
  });
  if (error) {
    return { success: false, message: error.message ?? "RPC failed" };
  }
  const r = (data ?? {}) as {
    success?: boolean;
    period_end?: string | null;
    remaining_gold?: number;
  };
  if (!r.success) {
    return { success: false, message: "Upgrade failed" };
  }
  return {
    success: true,
    period_end: typeof r.period_end === "string" ? r.period_end : null,
    remaining_gold: Math.max(0, Number(r.remaining_gold ?? 0)),
  };
}

/**
 * Same semantics as DB RPC when PostgREST cannot see the function yet.
 * Uses optimistic locking on gold_coins to avoid double-spend under concurrency.
 */
export async function purchaseMembershipWithBalanceFallback(
  admin: SupabaseClient,
  userId: string,
  tier: PaidMembershipTierId,
  priceGc: number,
  extendFromIso: string | null | undefined
): Promise<RpcPurchaseResult> {
  const periodEndIso = computePeriodEndIso(extendFromIso ?? null);

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error: readErr } = await admin
      .from("users")
      .select("gold_coins")
      .eq("id", userId)
      .maybeSingle();

    if (readErr || !row) {
      return { success: false, message: readErr?.message ?? "User not found" };
    }

    const current = Math.max(0, Math.floor(Number((row as { gold_coins?: number | null }).gold_coins ?? 0)));
    if (current < priceGc) {
      return {
        success: false,
        message: `Insufficient gold coins (have ${current}, need ${priceGc})`,
      };
    }

    const remaining = current - priceGc;

    const { data: updated, error: updErr } = await admin
      .from("users")
      .update({
        gold_coins: remaining,
        membership: tier,
        membership_tier: tier,
        membership_expires_at: periodEndIso,
        membership_payment_source: "balance",
        stripe_subscription_id: null,
        subscription_status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .eq("gold_coins", current)
      .select("membership_expires_at, gold_coins")
      .maybeSingle();

    if (updErr) {
      return { success: false, message: updErr.message };
    }

    if (updated) {
      await admin
        .from("membership_purchases")
        .insert({
          user_id: userId,
          tier,
          price_gc: priceGc,
          payment_method: "balance",
          period_end: periodEndIso,
        })
        .then(({ error: insErr }) => {
          if (insErr && !/relation|does not exist|42P01/i.test(insErr.message)) {
            console.warn("[membership-purchase-balance] membership_purchases insert:", insErr.message);
          }
        });

      const pe = (updated as { membership_expires_at?: string | null }).membership_expires_at;
      return {
        success: true,
        period_end: typeof pe === "string" ? pe : periodEndIso,
        remaining_gold: remaining,
      };
    }
  }

  return { success: false, message: "Could not complete purchase (busy). Try again." };
}

export async function purchaseMembershipWithBalance(
  admin: SupabaseClient,
  userId: string,
  tier: PaidMembershipTierId,
  priceGc: number,
  extendFromIso: string | null | undefined
): Promise<RpcPurchaseResult> {
  const rpc = await purchaseMembershipWithBalanceRpc(admin, userId, tier, priceGc, extendFromIso);
  if (rpc.success) return rpc;
  if (shouldUsePurchaseMembershipFallback({ message: rpc.message })) {
    return purchaseMembershipWithBalanceFallback(admin, userId, tier, priceGc, extendFromIso);
  }
  return rpc;
}
