import { createAdminClient } from "@/lib/supabase";

export type WalletDirection = "credit" | "debit";
export type WalletTrackType = "deposit" | "withdrawal" | "earning" | "none";

export interface WalletSnapshot {
  userId: string;
  balanceCents: number;
  withdrawableCents: number;
  totalDepositsCents: number;
  totalWithdrawalsCents: number;
  totalEarningsCents: number;
  isBanned: boolean;
}

export interface WalletAdjustmentInput {
  userId: string;
  amountCents: number;
  direction: WalletDirection;
  track?: WalletTrackType;
  affectWithdrawable?: boolean;
  allowNegative?: boolean;
}

export interface WalletAdjustmentResult {
  success: boolean;
  message?: string;
  balanceCents?: number;
  withdrawableCents?: number;
}

function asCents(value: unknown): number {
  return Math.round(Number(value ?? 0));
}

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

export async function getWalletSnapshot(userId: string): Promise<WalletSnapshot | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("users")
    .select(
      "id, balance, withdrawable_balance, total_deposits, total_withdrawals, total_earnings, is_banned"
    )
    .eq("id", userId)
    .maybeSingle();

  if (!error && data) {
    const row = data as {
      id: string;
      balance?: number;
      withdrawable_balance?: number;
      total_deposits?: number;
      total_withdrawals?: number;
      total_earnings?: number;
      is_banned?: boolean;
    };

    return {
      userId: row.id,
      balanceCents: asCents(row.balance),
      withdrawableCents: asCents(row.withdrawable_balance ?? row.balance),
      totalDepositsCents: asCents(row.total_deposits),
      totalWithdrawalsCents: asCents(row.total_withdrawals),
      totalEarningsCents: asCents(row.total_earnings),
      isBanned: !!row.is_banned,
    };
  }

  // Backward compatibility for older schemas missing aggregate columns.
  const { data: legacyData, error: legacyError } = await supabase
    .from("users")
    .select("id, balance")
    .eq("id", userId)
    .maybeSingle();
  if (legacyError || !legacyData) return null;
  const row = legacyData as { id: string; balance?: number };
  return {
    userId: row.id,
    balanceCents: asCents(row.balance),
    withdrawableCents: asCents(row.balance),
    totalDepositsCents: 0,
    totalWithdrawalsCents: 0,
    totalEarningsCents: 0,
    isBanned: false,
  };
}

/**
 * Applies a wallet update server-side only.
 * Uses SQL RPC if available (atomic), then falls back to a direct update.
 */
export async function applyWalletAdjustment(
  input: WalletAdjustmentInput
): Promise<WalletAdjustmentResult> {
  const supabase = createAdminClient();
  if (!supabase) {
    return { success: false, message: "Database unavailable" };
  }

  const amountCents = asCents(input.amountCents);
  if (!input.userId || amountCents <= 0) {
    return { success: false, message: "Invalid wallet adjustment request" };
  }

  const track = input.track ?? "none";
  const affectWithdrawable = input.affectWithdrawable ?? true;
  const allowNegative = !!input.allowNegative;

  // Preferred: atomic SQL function.
  const { data: rpcData, error: rpcError } = await supabase.rpc("apply_wallet_adjustment", {
    p_user_id: input.userId,
    p_amount_cents: amountCents,
    p_direction: input.direction,
    p_track: track,
    p_affect_withdrawable: affectWithdrawable,
    p_allow_negative: allowNegative,
  });

  if (!rpcError && rpcData) {
    const payload = rpcData as {
      success?: boolean;
      message?: string;
      balanceCents?: number;
      withdrawableCents?: number;
    };
    if (payload.success) {
      return {
        success: true,
        balanceCents: asCents(payload.balanceCents),
        withdrawableCents: asCents(payload.withdrawableCents),
      };
    }
    return { success: false, message: payload.message ?? "Wallet update failed" };
  }

  // Fallback path if RPC is not deployed yet.
  if (rpcError) {
    console.warn("apply_wallet_adjustment RPC unavailable, using fallback:", rpcError.message);
  }

  const snapshot = await getWalletSnapshot(input.userId);
  if (!snapshot) {
    return { success: false, message: "User not found" };
  }
  if (snapshot.isBanned) {
    return { success: false, message: "User account is suspended" };
  }

  const signed = input.direction === "credit" ? amountCents : -amountCents;
  const nextBalance = snapshot.balanceCents + signed;
  if (!allowNegative && nextBalance < 0) {
    return { success: false, message: "Insufficient balance" };
  }

  const nextWithdrawable = affectWithdrawable
    ? clampNonNegative(snapshot.withdrawableCents + signed)
    : snapshot.withdrawableCents;

  let nextTotalDeposits = snapshot.totalDepositsCents;
  let nextTotalWithdrawals = snapshot.totalWithdrawalsCents;
  let nextTotalEarnings = snapshot.totalEarningsCents;

  if (track === "deposit") {
    nextTotalDeposits = clampNonNegative(
      snapshot.totalDepositsCents + (input.direction === "credit" ? amountCents : -amountCents)
    );
  } else if (track === "withdrawal") {
    nextTotalWithdrawals = clampNonNegative(
      snapshot.totalWithdrawalsCents + (input.direction === "credit" ? amountCents : -amountCents)
    );
  } else if (track === "earning") {
    nextTotalEarnings = clampNonNegative(
      snapshot.totalEarningsCents + (input.direction === "credit" ? amountCents : -amountCents)
    );
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({
      balance: nextBalance,
      withdrawable_balance: nextWithdrawable,
      total_deposits: nextTotalDeposits,
      total_withdrawals: nextTotalWithdrawals,
      total_earnings: nextTotalEarnings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.userId);

  if (updateError) {
    // Backward compatibility: retry with reduced columns if aggregate fields don't exist.
    const reducedUpdate = await supabase
      .from("users")
      .update({
        balance: nextBalance,
        withdrawable_balance: nextWithdrawable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.userId);
    if (reducedUpdate.error) {
      const minimalUpdate = await supabase
        .from("users")
        .update({
          balance: nextBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.userId);
      if (minimalUpdate.error) {
        return { success: false, message: minimalUpdate.error.message };
      }
    }
  }

  return {
    success: true,
    balanceCents: nextBalance,
    withdrawableCents: nextWithdrawable,
  };
}
