import { HttpError } from "../lib/http-error";
import { getServiceClient } from "./supabase.service";

export interface WalletSummary {
  userId: string;
  balance: number;
  rewardsEarned: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  updatedAt: string;
}

export interface TransactionRecord {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface RewardCreditResult {
  rewardEventId: string;
  transactionId: string;
  balance: number;
  rewardsEarned: number;
}

export interface WithdrawalRecord {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  payment_method: string;
  admin_note: string | null;
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
}

const service = getServiceClient();

function asNumber(value: unknown): number {
  return Number(value ?? 0);
}

export async function ensureWallet(userId: string): Promise<void> {
  const { error } = await service.rpc("gp_ensure_wallet", {
    p_user_id: userId
  });

  if (error) {
    throw new HttpError(500, "Failed to initialize wallet", error.message);
  }
}

export async function getWalletSummary(userId: string): Promise<WalletSummary> {
  await ensureWallet(userId);

  const [{ data: wallet, error: walletError }, { data: pendingRows, error: pendingError }] = await Promise.all([
    service
      .from("wallets")
      .select("user_id,balance,rewards_earned,total_withdrawn,updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    service
      .from("withdrawals")
      .select("amount")
      .eq("user_id", userId)
      .in("status", ["pending", "approved"])
  ]);

  if (walletError || !wallet) {
    throw new HttpError(500, "Unable to read wallet");
  }
  if (pendingError) {
    throw new HttpError(500, "Unable to compute pending withdrawals");
  }

  const pendingWithdrawals = (pendingRows ?? []).reduce(
    (total: number, row: { amount?: number | null }) => total + asNumber(row.amount),
    0
  );

  return {
    userId: String(wallet.user_id),
    balance: asNumber((wallet as { balance?: unknown }).balance),
    rewardsEarned: asNumber((wallet as { rewards_earned?: unknown }).rewards_earned),
    totalWithdrawn: asNumber((wallet as { total_withdrawn?: unknown }).total_withdrawn),
    pendingWithdrawals,
    updatedAt: String((wallet as { updated_at?: string }).updated_at ?? new Date().toISOString())
  };
}

export async function listTransactionsByUser(
  userId: string,
  limit = 50,
  offset = 0
): Promise<TransactionRecord[]> {
  const { data, error } = await service
    .from("transactions")
    .select("id,user_id,type,amount,status,description,reference_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new HttpError(500, "Unable to load transactions");
  }

  return (data ?? []) as TransactionRecord[];
}

export async function creditReward(input: {
  userId: string;
  amount: number;
  eventType: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}): Promise<RewardCreditResult> {
  const { userId, amount, eventType, idempotencyKey, metadata } = input;

  const { data, error } = await service.rpc("gp_credit_reward", {
    p_user_id: userId,
    p_amount: Math.round(amount),
    p_event_type: eventType,
    p_idempotency_key: idempotencyKey ?? null,
    p_metadata: metadata ?? {}
  });

  if (error) {
    throw new HttpError(400, error.message);
  }

  const payload = data as {
    reward_event_id?: string;
    transaction_id?: string;
    balance?: number;
    rewards_earned?: number;
    error?: string;
  } | null;

  if (!payload || payload.error) {
    throw new HttpError(400, payload?.error ?? "Reward credit failed");
  }

  return {
    rewardEventId: String(payload.reward_event_id),
    transactionId: String(payload.transaction_id),
    balance: asNumber(payload.balance),
    rewardsEarned: asNumber(payload.rewards_earned)
  };
}

export async function requestWithdrawal(input: {
  userId: string;
  amount: number;
  paymentMethod: string;
  metadata?: Record<string, unknown>;
}): Promise<WithdrawalRecord> {
  const { userId, amount, paymentMethod, metadata } = input;

  const { data, error } = await service.rpc("gp_request_withdrawal", {
    p_user_id: userId,
    p_amount: Math.round(amount),
    p_payment_method: paymentMethod,
    p_metadata: metadata ?? {}
  });

  if (error) {
    throw new HttpError(400, error.message);
  }

  const payload = data as { error?: string; withdrawal?: WithdrawalRecord } | null;
  if (!payload || payload.error || !payload.withdrawal) {
    throw new HttpError(400, payload?.error ?? "Withdrawal request failed");
  }

  return payload.withdrawal;
}

export async function listWithdrawalsByUser(userId: string): Promise<WithdrawalRecord[]> {
  const { data, error } = await service
    .from("withdrawals")
    .select("id,user_id,amount,status,payment_method,admin_note,requested_at,processed_at,processed_by")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "Unable to read withdrawals");
  }
  return (data ?? []) as WithdrawalRecord[];
}

export async function applyStripeDeposit(input: {
  userId: string;
  amount: number;
  stripeSessionId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { userId, amount, stripeSessionId, metadata } = input;

  const { error } = await service.rpc("gp_apply_stripe_deposit", {
    p_user_id: userId,
    p_amount: Math.round(amount),
    p_reference_id: stripeSessionId,
    p_metadata: metadata ?? {}
  });

  if (error) {
    throw new HttpError(500, `Stripe deposit application failed: ${error.message}`);
  }
}

export async function adminManualCredit(input: {
  adminUserId: string;
  userId: string;
  amount: number;
  reason: string;
}): Promise<void> {
  const { adminUserId, userId, amount, reason } = input;

  const { data, error } = await service.rpc("gp_admin_manual_credit", {
    p_admin_user_id: adminUserId,
    p_user_id: userId,
    p_amount: Math.round(amount),
    p_reason: reason
  });

  if (error) {
    throw new HttpError(400, error.message);
  }
  const payload = data as { error?: string } | null;
  if (payload?.error) {
    throw new HttpError(400, payload.error);
  }
}

export async function adminProcessWithdrawal(input: {
  adminUserId: string;
  withdrawalId: string;
  status: "approved" | "rejected" | "paid";
  adminNote?: string;
}): Promise<void> {
  const { adminUserId, withdrawalId, status, adminNote } = input;
  const { data, error } = await service.rpc("gp_admin_process_withdrawal", {
    p_admin_user_id: adminUserId,
    p_withdrawal_id: withdrawalId,
    p_status: status,
    p_admin_note: adminNote ?? null
  });

  if (error) {
    throw new HttpError(400, error.message);
  }

  const payload = data as { error?: string } | null;
  if (payload?.error) {
    throw new HttpError(400, payload.error);
  }
}

export async function adminListUsers(limit = 100, offset = 0) {
  const { data, error } = await service
    .from("users")
    .select("id,email,role,is_super_admin,created_at,wallets(balance,rewards_earned,total_withdrawn,updated_at)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new HttpError(500, "Unable to list users");
  }

  return (data ?? []).map((row) => {
    const walletEntry = Array.isArray((row as { wallets?: unknown[] }).wallets)
      ? ((row as { wallets?: unknown[] }).wallets?.[0] as {
          balance?: number;
          rewards_earned?: number;
          total_withdrawn?: number;
          updated_at?: string;
        } | undefined)
      : undefined;

    return {
      id: String(row.id),
      email: String((row as { email?: string | null }).email ?? ""),
      role: String((row as { role?: string }).role ?? "user"),
      isSuperAdmin: Boolean((row as { is_super_admin?: boolean }).is_super_admin),
      createdAt: String((row as { created_at?: string }).created_at ?? ""),
      wallet: {
        balance: asNumber(walletEntry?.balance),
        rewardsEarned: asNumber(walletEntry?.rewards_earned),
        totalWithdrawn: asNumber(walletEntry?.total_withdrawn),
        updatedAt: String(walletEntry?.updated_at ?? "")
      }
    };
  });
}

export async function adminListWithdrawals(status?: string, limit = 100, offset = 0) {
  let query = service
    .from("withdrawals")
    .select("id,user_id,amount,status,payment_method,admin_note,requested_at,processed_at,processed_by,users(email)")
    .order("requested_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    throw new HttpError(500, "Unable to list withdrawals");
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    userId: String((row as { user_id?: string }).user_id ?? ""),
    userEmail: String(
      (row as { users?: { email?: string | null } | null }).users?.email ?? ""
    ),
    amount: asNumber((row as { amount?: unknown }).amount),
    status: String((row as { status?: string }).status ?? ""),
    paymentMethod: String((row as { payment_method?: string }).payment_method ?? ""),
    adminNote: (row as { admin_note?: string | null }).admin_note ?? null,
    requestedAt: String((row as { requested_at?: string }).requested_at ?? ""),
    processedAt: (row as { processed_at?: string | null }).processed_at ?? null,
    processedBy: (row as { processed_by?: string | null }).processed_by ?? null
  }));
}

export async function adminListRewardEvents(limit = 100, offset = 0, userId?: string) {
  let query = service
    .from("reward_events")
    .select("id,user_id,amount,event_type,idempotency_key,created_at,users(email)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    throw new HttpError(500, "Unable to list reward events");
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    userId: String((row as { user_id?: string }).user_id ?? ""),
    userEmail: String(
      (row as { users?: { email?: string | null } | null }).users?.email ?? ""
    ),
    amount: asNumber((row as { amount?: unknown }).amount),
    eventType: String((row as { event_type?: string }).event_type ?? ""),
    idempotencyKey: (row as { idempotency_key?: string | null }).idempotency_key ?? null,
    createdAt: String((row as { created_at?: string }).created_at ?? "")
  }));
}
