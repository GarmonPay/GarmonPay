import { createAdminClient } from "@/lib/supabase";

export interface DepositRow {
  id: string;
  user_id: string;
  email: string;
  amount_cents: number;
  currency: string;
  status: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

function supabase() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase not configured");
  return client;
}

export async function listDepositsByUser(userId: string): Promise<DepositRow[]> {
  const { data, error } = await supabase()
    .from("deposits")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DepositRow[];
}

export async function listAllDeposits(): Promise<DepositRow[]> {
  const { data, error } = await supabase()
    .from("deposits")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DepositRow[];
}

export async function recordSuccessfulDeposit(params: {
  userId: string;
  email: string;
  amountCents: number;
  currency: string;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
}): Promise<{ inserted: boolean; depositId?: string }> {
  const client = supabase();

  const rpcPayload = {
    p_user_id: params.userId,
    p_email: params.email,
    p_amount_cents: params.amountCents,
    p_currency: params.currency,
    p_stripe_session_id: params.stripeSessionId,
    p_stripe_payment_intent_id: params.stripePaymentIntentId,
  };

  const rpcRes = await client.rpc("record_successful_deposit", rpcPayload);
  if (!rpcRes.error && rpcRes.data) {
    const result = rpcRes.data as { inserted?: boolean; depositId?: string };
    return { inserted: Boolean(result.inserted), depositId: result.depositId };
  }

  // Fallback path if SQL function is missing: dedupe insert by stripe_session_id,
  // then increment user balance.
  const { data: inserted, error: insertError } = await client
    .from("deposits")
    .insert({
      user_id: params.userId,
      email: params.email,
      amount_cents: params.amountCents,
      currency: params.currency,
      status: "succeeded",
      stripe_session_id: params.stripeSessionId,
      stripe_payment_intent_id: params.stripePaymentIntentId,
    })
    .select("id")
    .single();

  if (insertError) {
    if ((insertError as { code?: string }).code === "23505") {
      return { inserted: false };
    }
    throw insertError;
  }

  const balanceRes = await client.rpc("increment_user_balance", {
    p_user_id: params.userId,
    p_amount_cents: params.amountCents,
  });
  if (balanceRes.error) {
    const { data: userRow, error: selectError } = await client
      .from("users")
      .select("balance, withdrawable_balance")
      .eq("id", params.userId)
      .maybeSingle();
    if (selectError) {
      throw selectError;
    }
    const currentBalance = Number((userRow as { balance?: number } | null)?.balance ?? 0);
    const currentWithdrawable = Number((userRow as { withdrawable_balance?: number } | null)?.withdrawable_balance ?? 0);
    const { error: updateError } = await client
      .from("users")
      .update({
        balance: currentBalance + params.amountCents,
        withdrawable_balance: currentWithdrawable + params.amountCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.userId);
    if (updateError) {
      const { error: fallbackError } = await client
        .from("users")
        .update({
          balance: currentBalance + params.amountCents,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.userId);
      if (fallbackError) {
        throw fallbackError;
      }
    }
  }

  return { inserted: true, depositId: (inserted as { id?: string }).id };
}
