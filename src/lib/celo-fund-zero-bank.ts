import type { SupabaseClient } from "@supabase/supabase-js";
import { debitGpayCoins } from "@/lib/coins";

/**
 * Fund a settled zero bank once. Same banker + room + round count shares one debit.
 * A second call does not debit again and does not add GPC twice.
 */
export function zeroBankFundReference(
  roomId: string,
  bankerId: string,
  totalRounds: number
): string {
  const rounds = Math.max(0, Math.floor(Number(totalRounds) || 0));
  return `celo_zero_bank_fund_${roomId}_${bankerId}_${rounds}`;
}

export async function applyZeroBankFunding(params: {
  admin: SupabaseClient;
  roomId: string;
  bankerId: string;
  amountSc: number;
  totalRounds: number;
  roomPatch: Record<string, unknown>;
}): Promise<
  | { ok: true; room: Record<string, unknown>; idempotent: boolean }
  | { ok: false; status: number; error: string }
> {
  const { admin, roomId, bankerId, amountSc, totalRounds, roomPatch } = params;
  if (!Number.isFinite(amountSc) || amountSc <= 0) {
    return { ok: false, status: 400, error: "Funding amount must be greater than 0" };
  }

  const debitRef = zeroBankFundReference(roomId, bankerId, totalRounds);
  const debit = await debitGpayCoins(
    bankerId,
    amountSc,
    "C-Lo fund new bank",
    debitRef,
    "celo_entry"
  );
  const duplicate = !debit.success && /duplicate/i.test(debit.message ?? "");
  if (!debit.success && !duplicate) {
    return {
      ok: false,
      status: 400,
      error: debit.message ?? "Funding debit failed",
    };
  }

  const writeBank = () => {
    const now = new Date().toISOString();
    return admin
      .from("celo_rooms")
      .update({
        ...roomPatch,
        current_bank_sc: amountSc,
        current_bank_cents: amountSc,
        bank_busted: false,
        status: "waiting",
        last_activity: now,
      })
      .eq("id", roomId)
      .eq("banker_id", bankerId)
      .eq("current_bank_sc", 0)
      .select("*")
      .maybeSingle();
  };

  const { data: roomOut, error: upErr } = await writeBank();

  if (roomOut && !upErr) {
    return {
      ok: true,
      room: roomOut as Record<string, unknown>,
      idempotent: duplicate,
    };
  }

  const { data: fresh } = await admin
    .from("celo_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  const freshRow = fresh as {
    banker_id?: string | null;
    current_bank_sc?: number | null;
    current_bank_cents?: number | null;
  } | null;
  const bankNow = Math.max(
    0,
    Math.floor(Number(freshRow?.current_bank_sc ?? freshRow?.current_bank_cents ?? 0))
  );
  const stillOwner =
    freshRow?.banker_id != null && String(freshRow.banker_id) === String(bankerId);

  if (stillOwner && bankNow > 0) {
    return {
      ok: true,
      room: freshRow as Record<string, unknown>,
      idempotent: true,
    };
  }

  if (debit.success && !stillOwner) {
    const { creditCoins } = await import("@/lib/coins");
    await creditCoins(
      bankerId,
      0,
      amountSc,
      "C-Lo fund new bank refund",
      `celo_zero_bank_fund_refund_${debitRef}`,
      "celo_bank_refund"
    );
  }

  return {
    ok: false,
    status: 500,
    error: upErr?.message ?? "Could not fund the bank",
  };
}
