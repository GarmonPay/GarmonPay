import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import {
  listAllWithdrawals,
  updateWithdrawalStatus,
  rejectWithdrawal,
  approveWithdrawal,
  type WithdrawalStatus,
} from "@/lib/withdrawals-db";
import {
  markWithdrawalTransactionCompleted,
  markWithdrawalTransactionStatus,
} from "@/lib/transactions-db";
import { createAdminClient } from "@/lib/supabase";
import { applyWalletAdjustment } from "@/lib/wallet-ledger";
import { logAdminAction } from "@/lib/admin-logs";

/** GET /api/admin/withdrawals — list all withdrawals with user email. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ withdrawals: [] });
  }
  try {
    const withdrawals = await listAllWithdrawals();
    return NextResponse.json({ withdrawals });
  } catch (e) {
    console.error("Admin list withdrawals error:", e);
    return NextResponse.json({ withdrawals: [] });
  }
}

/** PATCH /api/admin/withdrawals — approve, reject, or mark paid. */
export async function PATCH(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }
  const adminId = request.headers.get("x-admin-id") ?? "";

  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  const status = body.status as WithdrawalStatus | undefined;
  if (!id || !status) {
    return NextResponse.json({ message: "id and status required" }, { status: 400 });
  }
  if (!["approved", "rejected", "paid"].includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const { data: currentRow, error: currentError } = await supabase
    .from("withdrawals")
    .select("id, user_id, amount, status")
    .eq("id", id)
    .maybeSingle();
  if (currentError || !currentRow) {
    return NextResponse.json({ message: "Withdrawal not found" }, { status: 404 });
  }
  const current = currentRow as {
    id: string;
    user_id: string;
    amount: number;
    status: string;
  };

  if (status === "rejected") {
    const result = await rejectWithdrawal(id);
    if (!result.success) {
      return NextResponse.json({ message: result.message ?? "Reject failed" }, { status: 400 });
    }

    // request_withdrawal RPC moves withdrawable/pending only; this keeps main balance in sync.
    await applyWalletAdjustment({
      userId: current.user_id,
      amountCents: Number(current.amount),
      direction: "credit",
      track: "none",
      affectWithdrawable: false,
      allowNegative: true,
    });
    await markWithdrawalTransactionStatus(
      id,
      "rejected",
      "Withdrawal rejected - balance refunded"
    ).catch(() => {});

    if (adminId) {
      await logAdminAction({
        adminId,
        action: "withdrawal_rejected",
        targetUserId: current.user_id,
        amountCents: Number(current.amount),
        metadata: { withdrawalId: id },
      });
    }

    return NextResponse.json({ message: "Rejected; user balance refunded" });
  }

  if (status === "approved") {
    if (current.status === "approved" || current.status === "paid") {
      return NextResponse.json({ message: "Withdrawal already approved/paid" });
    }
    const result = await approveWithdrawal(id);
    if (!result.success) {
      return NextResponse.json({ message: result.message ?? "Approve failed" }, { status: 400 });
    }
    await markWithdrawalTransactionStatus(
      id,
      "pending",
      "Withdrawal approved, awaiting payout"
    ).catch(() => {});

    if (adminId) {
      await logAdminAction({
        adminId,
        action: "withdrawal_approved",
        targetUserId: current.user_id,
        amountCents: Number(current.amount),
        metadata: { withdrawalId: id },
      });
    }

    return NextResponse.json({ withdrawal: result.withdrawal ?? undefined, message: "Approved; fee recorded" });
  }

  if (current.status === "pending") {
    const approveResult = await approveWithdrawal(id);
    if (!approveResult.success) {
      return NextResponse.json(
        { message: approveResult.message ?? "Could not approve before marking paid" },
        { status: 400 }
      );
    }
  }

  const updated = await updateWithdrawalStatus(id, status);
  if (!updated) {
    return NextResponse.json({ message: "Update failed or withdrawal not in pending/approved" }, { status: 400 });
  }
  if (status === "paid") {
    await markWithdrawalTransactionCompleted(id).catch(() => {});

    // Count paid withdrawals in wallet totals.
    const { data: userRow } = await supabase
      .from("users")
      .select("total_withdrawals")
      .eq("id", current.user_id)
      .maybeSingle();
    const currentTotal = Number(
      (userRow as { total_withdrawals?: number } | null)?.total_withdrawals ?? 0
    );
    await supabase
      .from("users")
      .update({
        total_withdrawals: currentTotal + Number(current.amount ?? 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.user_id);

    if (adminId) {
      await logAdminAction({
        adminId,
        action: "withdrawal_paid",
        targetUserId: current.user_id,
        amountCents: Number(current.amount),
        metadata: { withdrawalId: id },
      });
    }
  }
  return NextResponse.json({ withdrawal: updated });
}
