import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { approveWithdrawal } from "@/lib/withdrawals-db";

/** POST /api/admin/withdrawals/approve — approve withdrawal request by id. */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { withdrawalId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const withdrawalId = typeof body.withdrawalId === "string" ? body.withdrawalId : "";
  if (!withdrawalId) {
    return NextResponse.json({ message: "withdrawalId required" }, { status: 400 });
  }

  const result = await approveWithdrawal(withdrawalId);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Approve failed" }, { status: 400 });
  }

  return NextResponse.json({ success: true, withdrawal: result.withdrawal ?? null });
}
