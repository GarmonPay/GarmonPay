import { NextResponse } from "next/server";
import { findUserById, hasAdminAccess } from "@/lib/auth-store";
import {
  listAllWithdrawals,
  updateWithdrawalStatus,
  rejectWithdrawal,
  type WithdrawalStatus,
} from "@/lib/withdrawals-db";
import { markWithdrawalTransactionCompleted } from "@/lib/transactions-db";
import { createAdminClient } from "@/lib/supabase";

function isAdmin(request: Request): boolean {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return false;
  const user = findUserById(adminId);
  return !!(user && hasAdminAccess(user));
}

/** GET /api/admin/withdrawals — list all withdrawals with user email. */
export async function GET(request: Request) {
  if (!isAdmin(request)) {
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
  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (!createAdminClient()) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }
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

  if (status === "rejected") {
    const result = await rejectWithdrawal(id);
    if (!result.success) {
      return NextResponse.json({ message: result.message ?? "Reject failed" }, { status: 400 });
    }
    return NextResponse.json({ message: "Rejected; balance refunded" });
  }

  const updated = await updateWithdrawalStatus(id, status);
  if (!updated) {
    return NextResponse.json({ message: "Update failed or withdrawal not pending" }, { status: 400 });
  }
  if (status === "paid" || status === "approved") {
    await markWithdrawalTransactionCompleted(id);
  }
  return NextResponse.json({ withdrawal: updated });
}
