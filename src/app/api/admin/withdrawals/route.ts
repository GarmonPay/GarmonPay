import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

/** GET /api/admin/withdrawals — list all withdrawals with user email. */
export async function GET(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Database unavailable", withdrawals: [] }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const statusFilter = (searchParams.get("status") ?? "pending").toLowerCase();

  let query = supabase.from("withdrawals").select("*").order("created_at", { ascending: false });
  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data: withdrawals, error } = await query;
  if (error) {
    return NextResponse.json({ message: error.message, withdrawals: [] }, { status: 500 });
  }

  const rows = (withdrawals ?? []) as Array<Record<string, unknown>>;
  const userIds = Array.from(new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean)));
  const emailByUserId = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: users } = await supabase.from("users").select("id, email").in("id", userIds);
    for (const user of users ?? []) {
      const row = user as { id: string; email: string | null };
      if (row.email) {
        emailByUserId.set(row.id, row.email);
      }
    }
  }

  return NextResponse.json({
    withdrawals: rows.map((row) => ({
      ...row,
      user_email: emailByUserId.get(String(row.user_id ?? "")) ?? null,
    })),
  });
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

  let body: { id?: string; status?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const rawStatus = typeof body.status === "string" ? body.status : body.action;
  const status = typeof rawStatus === "string" ? rawStatus.toLowerCase() : null;

  if (!id || !status) {
    return NextResponse.json({ message: "id and status required" }, { status: 400 });
  }
  if (!["approved", "rejected", "paid"].includes(status)) {
    return NextResponse.json({ message: "Invalid status" }, { status: 400 });
  }

  const { data: withdrawal, error: withdrawalError } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (withdrawalError || !withdrawal) {
    return NextResponse.json({ message: "Withdrawal not found" }, { status: 404 });
  }

  const row = withdrawal as {
    id: string;
    user_id: string;
    amount: number;
    status: string;
  };
  const amount = Number(row.amount ?? 0);

  if (status === "paid") {
    if (!["approved", "paid"].includes(String(row.status).toLowerCase())) {
      return NextResponse.json({ message: "Only approved withdrawals can be marked paid" }, { status: 400 });
    }
    const { data: paidRow, error: paidError } = await supabase
      .from("withdrawals")
      .update({ status: "paid" })
      .eq("id", id)
      .eq("status", "approved")
      .select("*")
      .maybeSingle();
    if (paidError) {
      return NextResponse.json({ message: paidError.message }, { status: 500 });
    }
    await supabase
      .from("transactions")
      .update({ status: "completed", description: "Withdrawal paid" })
      .eq("reference_id", id)
      .eq("type", "withdrawal");
    return NextResponse.json({ withdrawal: paidRow ?? row, message: "Marked as paid" });
  }

  if (String(row.status).toLowerCase() !== "pending") {
    return NextResponse.json({ message: "Only pending withdrawals can be updated" }, { status: 400 });
  }

  const txLookup = await supabase
    .from("transactions")
    .select("id, status")
    .eq("reference_id", id)
    .eq("type", "withdrawal")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingTx = txLookup.data as { id?: string; status?: string } | null;
  const hasPendingWithdrawalTx = existingTx?.status === "pending";

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("balance")
    .eq("id", row.user_id)
    .maybeSingle();
  if (userError || !user) {
    return NextResponse.json({ message: "User not found" }, { status: 404 });
  }

  const currentBalance = Number((user as { balance?: number }).balance ?? 0);
  const needsApproveDeduction = status === "approved" && !hasPendingWithdrawalTx;
  const needsRejectRestore = status === "rejected" && hasPendingWithdrawalTx;

  if (needsApproveDeduction && currentBalance < amount) {
    return NextResponse.json({ message: "Insufficient user balance" }, { status: 400 });
  }

  const nextBalance = needsApproveDeduction
    ? currentBalance - amount
    : needsRejectRestore
      ? currentBalance + amount
      : currentBalance;

  if (nextBalance !== currentBalance) {
    const { error: updateBalanceError } = await supabase
      .from("users")
      .update({ balance: nextBalance, updated_at: new Date().toISOString() })
      .eq("id", row.user_id);

    if (updateBalanceError) {
      return NextResponse.json({ message: updateBalanceError.message }, { status: 500 });
    }
  }

  const { data: updatedWithdrawal, error: updateWithdrawalError } = await supabase
    .from("withdrawals")
    .update({ status })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (updateWithdrawalError || !updatedWithdrawal) {
    // Best-effort rollback to keep wallet consistent if status update fails after balance update.
    await supabase
      .from("users")
      .update({ balance: currentBalance, updated_at: new Date().toISOString() })
      .eq("id", row.user_id);
    return NextResponse.json(
      { message: updateWithdrawalError?.message ?? "Withdrawal update failed" },
      { status: 500 }
    );
  }

  if (status === "approved") {
    const txUpdate = await supabase
      .from("transactions")
      .update({ status: "completed", description: "Withdrawal approved" })
      .eq("reference_id", id)
      .eq("type", "withdrawal")
      .select("id")
      .limit(1);

    if (!txUpdate.data || txUpdate.data.length === 0) {
      await supabase.from("transactions").insert({
        user_id: row.user_id,
        type: "withdrawal",
        amount,
        status: "completed",
        description: "Withdrawal approved",
        reference_id: id,
      });
    }
    return NextResponse.json({ withdrawal: updatedWithdrawal, message: "Withdrawal approved" });
  }

  await supabase
    .from("transactions")
    .update({ status: "rejected", description: "Withdrawal rejected" })
    .eq("reference_id", id)
    .eq("type", "withdrawal");

  if (!existingTx?.id) {
    await supabase.from("transactions").insert({
      user_id: row.user_id,
      type: "withdrawal",
      amount,
      status: "rejected",
      description: "Withdrawal rejected",
      reference_id: id,
    });
  }

  return NextResponse.json({ withdrawal: updatedWithdrawal, message: "Withdrawal rejected" });
}
