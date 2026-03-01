import { NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import {
  approveWithdrawal,
  rejectWithdrawal,
  updateWithdrawalStatus,
  type WithdrawalStatus,
} from "@/lib/withdrawals-db";
import { markWithdrawalTransactionCompleted } from "@/lib/transactions-db";

/** PATCH /api/admin/withdrawals/:id — process withdrawal status (Bearer admin auth). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const adminUserId = await getAdminUserId(request);
  if (!adminUserId) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const params = await context.params;
  const withdrawalId = params.id;
  if (!withdrawalId) {
    return NextResponse.json({ message: "Withdrawal id required" }, { status: 400 });
  }

  let body: { status?: string; adminNote?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  const status = body.status as WithdrawalStatus | undefined;
  const adminNote = typeof body.adminNote === "string" ? body.adminNote : null;

  if (!status || !["approved", "rejected", "paid"].includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const { error: rpcError } = await supabase.rpc("gp_admin_process_withdrawal", {
    p_admin_user_id: adminUserId,
    p_withdrawal_id: withdrawalId,
    p_status: status,
    p_admin_note: adminNote,
  });

  if (!rpcError) {
    if (status === "paid") {
      await markWithdrawalTransactionCompleted(withdrawalId).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  }

  // Backward compatibility fallback when RPC does not exist.
  if (status === "rejected") {
    const rejected = await rejectWithdrawal(withdrawalId);
    if (!rejected.success) {
      return NextResponse.json({ message: rejected.message ?? "Reject failed" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (status === "approved") {
    const approved = await approveWithdrawal(withdrawalId);
    if (!approved.success) {
      return NextResponse.json({ message: approved.message ?? "Approve failed" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  const paid = await updateWithdrawalStatus(withdrawalId, "paid");
  if (!paid) {
    return NextResponse.json({ message: "Could not mark as paid" }, { status: 400 });
  }
  await markWithdrawalTransactionCompleted(withdrawalId).catch(() => {});
  return NextResponse.json({ ok: true });
}
